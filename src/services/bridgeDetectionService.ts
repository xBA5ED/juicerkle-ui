import { createPublicClient, http, type Address } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'
import { type BridgeType, type BridgeInfo, type SuckerBridgeInfo } from '@/types/bridge'

// ABI for getting the DEPLOYER address from sucker contracts
const SUCKER_DEPLOYER_ABI = [
  {
    inputs: [],
    name: 'DEPLOYER',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

// Placeholder deployer address mappings (will be updated with real values)
const DEPLOYER_TO_BRIDGE_TYPE: Record<string, BridgeType> = {
  // ArbitrumCanonical deployer addresses (placeholder)
  '0x1111111111111111111111111111111111111111': 'ArbitrumCanonical',
  '0x2222222222222222222222222222222222222222': 'ArbitrumCanonical',
  
  // OptimismCanonical deployer addresses (placeholder)
  '0x3333333333333333333333333333333333333333': 'OptimismCanonical',
  '0x4444444444444444444444444444444444444444': 'OptimismCanonical',
  
  // CCIP deployer addresses (placeholder)
  '0x5555555555555555555555555555555555555555': 'CCIP',
  '0x6666666666666666666666666666666666666666': 'CCIP',
}

// Bridge configuration and characteristics
const BRIDGE_CONFIGS: Record<BridgeType, BridgeInfo> = {
  ArbitrumCanonical: {
    type: 'ArbitrumCanonical',
    requiresPayment: false,
    hasAdditionalSteps: false,
    displayName: 'Arbitrum Canonical Bridge',
    description: 'Official Arbitrum bridge for secure cross-chain transfers'
  },
  OptimismCanonical: {
    type: 'OptimismCanonical',
    requiresPayment: false,
    hasAdditionalSteps: false,
    displayName: 'Optimism Canonical Bridge',
    description: 'Official Optimism bridge for secure cross-chain transfers'
  },
  CCIP: {
    type: 'CCIP',
    requiresPayment: true,
    hasAdditionalSteps: true,
    displayName: 'Chainlink CCIP',
    description: 'Chainlink Cross-Chain Interoperability Protocol'
  },
  unknown: {
    type: 'unknown',
    requiresPayment: true, // Conservative default - assume payment required
    hasAdditionalSteps: true, // Conservative default - assume additional steps
    displayName: 'Unknown Bridge',
    description: 'Bridge implementation could not be determined'
  }
}

function createClient(chainId: number) {
  const chain = SUPPORTED_CHAINS[chainId as SupportedChainId]
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return createPublicClient({
    chain,
    transport: http()
  })
}

class BridgeDetectionService {
  // Cache for bridge detection results
  private bridgeCache = new Map<string, SuckerBridgeInfo>()

  /**
   * Get the deployer address from a sucker contract
   */
  private async getSuckerDeployer(chainId: number, suckerAddress: Address): Promise<Address> {
    try {
      const client = createClient(chainId)
      
      const deployer = await client.readContract({
        address: suckerAddress,
        abi: SUCKER_DEPLOYER_ABI,
        functionName: 'DEPLOYER'
      })

      return deployer as Address
    } catch (error) {
      console.error(`Failed to get deployer for sucker ${suckerAddress} on chain ${chainId}:`, error)
      throw error
    }
  }

  /**
   * Determine bridge type from deployer address
   */
  private getBridgeTypeFromDeployer(deployerAddress: string): BridgeType {
    const normalizedAddress = deployerAddress.toLowerCase()
    return DEPLOYER_TO_BRIDGE_TYPE[normalizedAddress] || 'unknown'
  }

  /**
   * Get bridge information for a specific bridge type
   */
  getBridgeInfo(bridgeType: BridgeType): BridgeInfo {
    return BRIDGE_CONFIGS[bridgeType]
  }

  /**
   * Detect the underlying bridge implementation for a sucker contract
   */
  async detectSuckerBridge(chainId: number, suckerAddress: Address): Promise<SuckerBridgeInfo> {
    const cacheKey = `${chainId}-${suckerAddress.toLowerCase()}`
    
    // Return cached result if available
    if (this.bridgeCache.has(cacheKey)) {
      return this.bridgeCache.get(cacheKey)!
    }

    try {
      // Get the deployer address from the sucker contract
      const deployerAddress = await this.getSuckerDeployer(chainId, suckerAddress)
      
      // Determine bridge type from deployer
      const bridgeType = this.getBridgeTypeFromDeployer(deployerAddress)
      
      // Get bridge configuration
      const bridgeInfo = this.getBridgeInfo(bridgeType)
      
      const result: SuckerBridgeInfo = {
        suckerAddress: suckerAddress.toLowerCase(),
        chainId,
        deployerAddress: deployerAddress.toLowerCase(),
        bridgeInfo
      }
      
      // Cache the result
      this.bridgeCache.set(cacheKey, result)
      
      console.log(`Detected bridge for sucker ${suckerAddress} on chain ${chainId}:`, result)
      
      return result
    } catch (error) {
      console.error(`Failed to detect bridge for sucker ${suckerAddress} on chain ${chainId}:`, error)
      
      // Return unknown bridge as fallback
      const fallbackResult: SuckerBridgeInfo = {
        suckerAddress: suckerAddress.toLowerCase(),
        chainId,
        deployerAddress: '0x0000000000000000000000000000000000000000',
        bridgeInfo: this.getBridgeInfo('unknown')
      }
      
      this.bridgeCache.set(cacheKey, fallbackResult)
      return fallbackResult
    }
  }

  /**
   * Batch detect bridge implementations for multiple suckers
   */
  async detectMultipleSuckerBridges(suckers: Array<{ chainId: number; address: Address }>): Promise<SuckerBridgeInfo[]> {
    const promises = suckers.map(({ chainId, address }) => 
      this.detectSuckerBridge(chainId, address)
    )
    
    return Promise.all(promises)
  }

  /**
   * Check if a bridge requires payment for toRemote() calls
   */
  async requiresPaymentForToRemote(chainId: number, suckerAddress: Address): Promise<boolean> {
    const bridgeInfo = await this.detectSuckerBridge(chainId, suckerAddress)
    return bridgeInfo.bridgeInfo.requiresPayment
  }

  /**
   * Check if a bridge has additional steps after sent_to_remote
   */
  async hasAdditionalStepsAfterSentToRemote(chainId: number, suckerAddress: Address): Promise<boolean> {
    const bridgeInfo = await this.detectSuckerBridge(chainId, suckerAddress)
    return bridgeInfo.bridgeInfo.hasAdditionalSteps
  }

  /**
   * Get human-readable bridge name for display
   */
  async getBridgeDisplayName(chainId: number, suckerAddress: Address): Promise<string> {
    const bridgeInfo = await this.detectSuckerBridge(chainId, suckerAddress)
    return bridgeInfo.bridgeInfo.displayName
  }

  /**
   * Clear cache (useful for testing or when deployer mappings are updated)
   */
  clearCache(): void {
    this.bridgeCache.clear()
  }

  /**
   * Update deployer mappings (for when real addresses are provided)
   */
  updateDeployerMappings(newMappings: Record<string, BridgeType>): void {
    // Clear cache since mappings have changed
    this.clearCache()
    
    // Update the mappings
    Object.assign(DEPLOYER_TO_BRIDGE_TYPE, newMappings)
    
    console.log('Updated deployer mappings:', DEPLOYER_TO_BRIDGE_TYPE)
  }

  /**
   * Get all current deployer mappings (for debugging)
   */
  getDeployerMappings(): Record<string, BridgeType> {
    return { ...DEPLOYER_TO_BRIDGE_TYPE }
  }
}

export const bridgeDetectionService = new BridgeDetectionService()