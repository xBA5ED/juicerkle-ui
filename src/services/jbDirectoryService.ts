import { createPublicClient, http, type Address } from 'viem'
import { JBAccountingContext } from '@/types/bridge'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'

const JB_DIRECTORY_ADDRESS: Address = '0x0bc9f153dee4d3d474ce0903775b9b2aaae9aa41'

const JB_DIRECTORY_ABI = [
  {
    name: 'terminalsOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }]
  }
] as const

const JB_TERMINAL_ABI = [
  {
    name: 'accountingContextsOf',
    type: 'function', 
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'token', type: 'address' },
          { name: 'decimals', type: 'uint8' },
          { name: 'currency', type: 'uint32' }
        ]
      }
    ]
  }
] as const

const JB_SUCKER_ABI = [
  {
    name: 'isMapped',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
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

class JBDirectoryService {
  async getTerminalsForProject(chainId: number, projectId: string): Promise<Address[]> {
    try {
      const client = createClient(chainId)
      
      const terminals = await client.readContract({
        address: JB_DIRECTORY_ADDRESS,
        abi: JB_DIRECTORY_ABI,
        functionName: 'terminalsOf',
        args: [BigInt(projectId)]
      })

      return [...terminals]
    } catch (error) {
      console.error(`Failed to get terminals for project ${projectId} on chain ${chainId}:`, error)
      throw new Error(`Failed to get terminals for project`)
    }
  }

  async getAccountingContextsForTerminal(
    chainId: number, 
    terminalAddress: Address, 
    projectId: string
  ): Promise<JBAccountingContext[]> {
    try {
      const client = createClient(chainId)
      
      const contexts = await client.readContract({
        address: terminalAddress,
        abi: JB_TERMINAL_ABI,
        functionName: 'accountingContextsOf',
        args: [BigInt(projectId)]
      })

      return contexts.map(context => ({
        token: context.token,
        decimals: context.decimals,
        currency: context.currency
      }))
    } catch (error) {
      console.error(`Failed to get accounting contexts for terminal ${terminalAddress} on chain ${chainId}:`, error)
      throw new Error(`Failed to get accounting contexts for terminal`)
    }
  }

  async isTokenMappedOnSucker(chainId: number, suckerAddress: Address, tokenAddress: Address): Promise<boolean> {
    try {
      const client = createClient(chainId)
      
      const isMapped = await client.readContract({
        address: suckerAddress,
        abi: JB_SUCKER_ABI,
        functionName: 'isMapped',
        args: [tokenAddress]
      })

      return isMapped
    } catch (error) {
      console.error(`Failed to check if token ${tokenAddress} is mapped on sucker ${suckerAddress}:`, error)
      return false
    }
  }

  async getSupportedTerminalTokenForProject(
    chainId: number, 
    projectId: string, 
    suckerAddress: Address
  ): Promise<Address | null> {
    try {
      const terminals = await this.getTerminalsForProject(chainId, projectId)
      
      if (terminals.length === 0) {
        return null
      }

      // Check all terminals and their accounting contexts
      for (const terminal of terminals) {
        const accountingContexts = await this.getAccountingContextsForTerminal(
          chainId, 
          terminal, 
          projectId
        )

        // Check each token to see if it's supported by the sucker
        for (const context of accountingContexts) {
          const tokenAddress = context.token as Address
          const isSupported = await this.isTokenMappedOnSucker(chainId, suckerAddress, tokenAddress)
          
          if (isSupported) {
            return tokenAddress
          }
        }
      }

      return null
    } catch (error) {
      console.error(`Failed to get supported terminal token for project ${projectId} on chain ${chainId}:`, error)
      return null
    }
  }

  async getTerminalTokenForProject(chainId: number, projectId: string): Promise<Address | null> {
    try {
      const terminals = await this.getTerminalsForProject(chainId, projectId)
      
      if (terminals.length === 0) {
        return null
      }

      const firstTerminal = terminals[0]
      const accountingContexts = await this.getAccountingContextsForTerminal(
        chainId, 
        firstTerminal, 
        projectId
      )

      if (accountingContexts.length === 0) {
        return null
      }

      return accountingContexts[0].token as Address
    } catch (error) {
      console.error(`Failed to get terminal token for project ${projectId} on chain ${chainId}:`, error)
      return null
    }
  }
}

export const jbDirectoryService = new JBDirectoryService()