import { createPublicClient, http, type Address, parseUnits, formatUnits } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
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

class TokenService {
  async getTokenBalance(
    chainId: number,
    tokenAddress: Address,
    userAddress: Address
  ): Promise<bigint> {
    try {
      const client = createClient(chainId)
      
      const balance = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress]
      })

      return balance
    } catch (error) {
      console.error(`Failed to get token balance for ${tokenAddress}:`, error)
      return BigInt(0)
    }
  }

  async getTokenAllowance(
    chainId: number,
    tokenAddress: Address,
    ownerAddress: Address,
    spenderAddress: Address
  ): Promise<bigint> {
    try {
      const client = createClient(chainId)
      
      const allowance = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [ownerAddress, spenderAddress]
      })

      return allowance
    } catch (error) {
      console.error(`Failed to get token allowance for ${tokenAddress}:`, error)
      return BigInt(0)
    }
  }

  async getTokenDecimals(chainId: number, tokenAddress: Address): Promise<number> {
    try {
      const client = createClient(chainId)
      
      const decimals = await client.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals'
      })

      return decimals
    } catch (error) {
      console.error(`Failed to get token decimals for ${tokenAddress}:`, error)
      return 18 // Default to 18 decimals
    }
  }

  async checkBalanceAndAllowance(
    chainId: number,
    tokenAddress: Address,
    userAddress: Address,
    spenderAddress: Address,
    amountString: string
  ): Promise<{
    balance: bigint
    allowance: bigint
    decimals: number
    requiredAmount: bigint
    hasEnoughBalance: boolean
    hasEnoughAllowance: boolean
  }> {
    try {
      const [balance, allowance, decimals] = await Promise.all([
        this.getTokenBalance(chainId, tokenAddress, userAddress),
        this.getTokenAllowance(chainId, tokenAddress, userAddress, spenderAddress),
        this.getTokenDecimals(chainId, tokenAddress)
      ])

      const requiredAmount = parseUnits(amountString, decimals)

      return {
        balance,
        allowance,
        decimals,
        requiredAmount,
        hasEnoughBalance: balance >= requiredAmount,
        hasEnoughAllowance: allowance >= requiredAmount
      }
    } catch (error) {
      console.error('Failed to check balance and allowance:', error)
      throw error
    }
  }

  formatTokenAmount(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals)
  }
}

export const tokenService = new TokenService()