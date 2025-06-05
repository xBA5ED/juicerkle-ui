import { BridgeTransaction, Token } from '../types/bridge'
import { base, mainnet, optimism, arbitrum } from 'wagmi/chains'

// Mock tokens
const mockTokens: Token[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0x0000000000000000000000000000000000000000',
    decimals: 18,
    projectId: 'ethereum',
    // No logoUrl to use the fallback
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    projectId: 'usd-coin',
    // No logoUrl to use the fallback
  },
  {
    symbol: 'JUICE',
    name: 'Juicebox',
    address: '0x6D5a7597896A703Fe8c85775B23395a48f971305',
    decimals: 18,
    projectId: 'juicebox',
    // No logoUrl to use the fallback
  }
]

// Mock bridge transactions
const mockTransactions: BridgeTransaction[] = [
  {
    id: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    sourceChainId: mainnet.id,
    destinationChainId: base.id,
    token: mockTokens[0],
    amount: '1.5',
    status: 'awaiting_bridge'
  },
  {
    id: '0x2345678901abcdef2345678901abcdef2345678901abcdef2345678901abcdef',
    sourceChainId: mainnet.id,
    destinationChainId: optimism.id,
    token: mockTokens[1],
    amount: '100',
    status: 'in_transit'
  },
  {
    id: '0x3456789012abcdef3456789012abcdef3456789012abcdef3456789012abcdef',
    sourceChainId: arbitrum.id,
    destinationChainId: base.id,
    token: mockTokens[2],
    amount: '50',
    status: 'awaiting_claim'
  },
  {
    id: '0x4567890123abcdef4567890123abcdef4567890123abcdef4567890123abcdef',
    sourceChainId: base.id,
    destinationChainId: mainnet.id,
    token: mockTokens[0],
    amount: '0.75',
    status: 'awaiting_claim'
  }
]

export const getBridgeTransactions = async (): Promise<BridgeTransaction[]> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500))
  return mockTransactions
}

export const getAvailableTokens = async (): Promise<Token[]> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 300))
  return mockTokens
}

export const getAvailableChains = () => {
  return [mainnet, base, optimism, arbitrum]
}

export const createBridgeTransaction = async (
  sourceChainId: number,
  destinationChainId: number,
  tokenAddress: string,
  amount: string
): Promise<BridgeTransaction> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const token = mockTokens.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase())
  
  if (!token) {
    throw new Error('Token not found')
  }
  
  const newTransaction: BridgeTransaction = {
    id: `0x${Math.random().toString(16).substring(2, 66)}`,
    sourceChainId,
    destinationChainId,
    token,
    amount,
    status: 'awaiting_bridge'
  }
  
  // In a real app, you would send this to your backend
  return newTransaction
}