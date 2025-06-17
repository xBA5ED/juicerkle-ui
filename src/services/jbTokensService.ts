import { createPublicClient, http, type Address } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'

// JBTokens contract address (same on all chains)
const JB_TOKENS_ADDRESS = '0xa59e9f424901fb9dbd8913a9a32a081f9425bf36' as Address

// JBTokens ABI for the projectIdOf mapping
const JB_TOKENS_ABI = [
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'projectIdOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

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

export class JBTokensService {
  async getProjectIdForToken(chainId: number, tokenAddress: Address): Promise<string | null> {
    try {
      const client = createClient(chainId)
      
      const result = await client.readContract({
        address: JB_TOKENS_ADDRESS,
        abi: JB_TOKENS_ABI,
        functionName: 'projectIdOf',
        args: [tokenAddress]
      })
      
      // Convert BigInt to string, return null if 0 (not found)
      const projectId = result.toString()
      return projectId === '0' ? null : projectId
    } catch (error) {
      console.error(`Failed to get project ID for token ${tokenAddress} on chain ${chainId}:`, error)
      throw error
    }
  }

  // Helper method to check if a chain is supported
  isSupportedChain(chainId: number): chainId is SupportedChainId {
    return chainId in SUPPORTED_CHAINS
  }
}

// Export a singleton instance
export const jbTokensService = new JBTokensService()