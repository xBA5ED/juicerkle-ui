import { type Address } from 'viem'
import { JBSuckersPair, ProjectSuckerMapping, SuckerDiscoveryResult, SuckerPair } from '@/types/bridge'
import { getSharedPublicClient } from '@/utils/clientUtils'
import { bridgeDetectionService } from './bridgeDetectionService'

// Registry address for JBSuckerRegistry
const REGISTRY_ADDRESS = '0x696c7e9b37d28edbefa3fce06e26041b7197c1a5' as Address

// Registry ABI for the functions we need
const REGISTRY_ABI = [
  {
    inputs: [{ name: 'projectId', type: 'uint256' }],
    name: 'suckerPairsOf',
    outputs: [
      {
        components: [
          { name: 'local', type: 'address' },
          { name: 'remote', type: 'address' },
          { name: 'remoteChainId', type: 'uint256' }
        ],
        name: 'pairs',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// Sucker ABI for getting project ID
const SUCKER_ABI = [
  {
    inputs: [],
    name: 'projectId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

export class SuckerDiscoveryService {
  async getProjectIdFromSucker(chainId: number, suckerAddress: Address): Promise<string> {
    try {
      const client = getSharedPublicClient(chainId)
      
      const result = await client.readContract({
        address: suckerAddress,
        abi: SUCKER_ABI,
        functionName: 'projectId'
      })
      
      return result.toString()
    } catch (error) {
      console.error(`Failed to get project ID from sucker ${suckerAddress} on chain ${chainId}:`, error)
      throw error
    }
  }

  async getSuckerPairsForProject(chainId: number, projectId: string): Promise<JBSuckersPair[]> {
    try {
      const client = getSharedPublicClient(chainId)
      
      const result = await client.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'suckerPairsOf',
        args: [BigInt(projectId)]
      })
      
      // Convert the result to our interface format
      return result.map((pair: { local: string; remote: string; remoteChainId: bigint }) => ({
        local: pair.local as string,
        remote: pair.remote as string,
        remoteChainId: Number(pair.remoteChainId)
      }))
    } catch (error) {
      console.error(`Failed to get sucker pairs for project ${projectId} on chain ${chainId}:`, error)
      throw error
    }
  }

  private createSuckerPairId(chainAId: number, addressA: string, chainBId: number, addressB: string): string {
    // Create a deterministic ID by sorting the chain/address combinations
    const pairA = `${chainAId}-${addressA.toLowerCase()}`
    const pairB = `${chainBId}-${addressB.toLowerCase()}`
    return pairA < pairB ? `${pairA}:${pairB}` : `${pairB}:${pairA}`
  }

  async discoverAllSuckers(initialChainId: number, initialProjectId: string): Promise<SuckerDiscoveryResult> {
    const projectMappings = new Map<string, ProjectSuckerMapping>()
    const suckerPairs = new Map<string, SuckerPair>()
    const checkedCombinations = new Set<string>()
    const processedPairs = new Set<string>()
    const toCheck: Array<{ chainId: number; projectId: string }> = [
      { chainId: initialChainId, projectId: initialProjectId }
    ]

    while (toCheck.length > 0) {
      const { chainId, projectId } = toCheck.pop()!
      const key = `${chainId}-${projectId}`
      
      if (checkedCombinations.has(key)) {
        continue
      }
      
      checkedCombinations.add(key)
      
      try {
        console.log(`Discovering suckers for project ${projectId} on chain ${chainId}`)
        
        const rawSuckerPairs = await this.getSuckerPairsForProject(chainId, projectId)
        
        // Store the mapping for this project/chain combination
        projectMappings.set(key, {
          projectId,
          chainId,
          suckerPairs: rawSuckerPairs
        })

        // Process each raw sucker pair to create proper SuckerPair objects
        for (const rawPair of rawSuckerPairs) {
          const pairId = this.createSuckerPairId(
            chainId, rawPair.local,
            rawPair.remoteChainId, rawPair.remote
          )
          
          // Skip if we've already processed this pair
          if (processedPairs.has(pairId)) {
            continue
          }
          
          try {
            // Get the project ID for the remote sucker
            const remoteProjectId = await this.getProjectIdFromSucker(
              rawPair.remoteChainId, 
              rawPair.remote as Address
            )
            
            // Create the complete sucker pair
            const suckerPair: SuckerPair = {
              id: pairId,
              chainA: {
                chainId: chainId,
                address: rawPair.local,
                projectId: projectId
              },
              chainB: {
                chainId: rawPair.remoteChainId,
                address: rawPair.remote,
                projectId: remoteProjectId
              }
            }
            
            suckerPairs.set(pairId, suckerPair)
            processedPairs.add(pairId)
            
            // Add remote project to queue for processing if not already checked
            const remoteKey = `${rawPair.remoteChainId}-${remoteProjectId}`
            if (!checkedCombinations.has(remoteKey)) {
              toCheck.push({
                chainId: rawPair.remoteChainId,
                projectId: remoteProjectId
              })
            }
          } catch (error) {
            console.warn(`Failed to get project ID for remote sucker ${rawPair.remote} on chain ${rawPair.remoteChainId}:`, error)
          }
        }
      } catch (error) {
        console.error(`Failed to discover suckers for project ${projectId} on chain ${chainId}:`, error)
      }
    }

    // Now detect bridge implementations for all discovered pairs
    console.log('Detecting bridge implementations for discovered pairs...')
    await this.populateBridgeInfo(suckerPairs)

    return {
      projectMappings,
      suckerPairs
    }
  }

  /**
   * Populate bridge information for all sucker pairs sequentially
   */
  private async populateBridgeInfo(suckerPairs: Map<string, SuckerPair>): Promise<void> {
    const allSuckers: Array<{ chainId: number; address: Address; pairId: string; side: 'chainA' | 'chainB' }> = []
    
    // Collect all unique suckers from all pairs
    for (const [pairId, pair] of suckerPairs.entries()) {
      allSuckers.push({
        chainId: pair.chainA.chainId,
        address: pair.chainA.address as Address,
        pairId,
        side: 'chainA'
      })
      allSuckers.push({
        chainId: pair.chainB.chainId,
        address: pair.chainB.address as Address,
        pairId,
        side: 'chainB'
      })
    }

    // Detect bridge implementations sequentially
    for (const sucker of allSuckers) {
      try {
        console.log(`Detecting bridge for sucker ${sucker.address} on chain ${sucker.chainId}`)
        const bridgeInfo = await bridgeDetectionService.detectSuckerBridge(sucker.chainId, sucker.address)
        
        // Update the pair with bridge info
        const pair = suckerPairs.get(sucker.pairId)
        if (pair) {
          pair[sucker.side].bridgeInfo = bridgeInfo
        }
      } catch (error) {
        console.warn(`Failed to detect bridge for sucker ${sucker.address} on chain ${sucker.chainId}:`, error)
        // Set unknown bridge info as fallback
        const pair = suckerPairs.get(sucker.pairId)
        if (pair) {
          pair[sucker.side].bridgeInfo = {
            suckerAddress: sucker.address.toLowerCase(),
            chainId: sucker.chainId,
            deployerAddress: 'unknown',
            bridgeInfo: bridgeDetectionService.getBridgeInfo('unknown')
          }
        }
      }
    }
  }
}

// Export a singleton instance
export const suckerDiscoveryService = new SuckerDiscoveryService()
