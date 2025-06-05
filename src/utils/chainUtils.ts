import { Chain } from 'wagmi/chains'
import { 
  mainnet, 
  optimism, 
  base, 
  arbitrum,
  sepolia,
  optimismSepolia,
  baseSepolia,
  arbitrumSepolia
} from 'viem/chains'

// Supported chains for sucker discovery (mainnets + testnets)
export const SUPPORTED_CHAINS = {
  // Mainnets
  1: mainnet,
  10: optimism,
  8453: base,
  42161: arbitrum,
  // Testnets
  11155111: sepolia,
  11155420: optimismSepolia,
  84532: baseSepolia,
  421614: arbitrumSepolia,
} as const

export type SupportedChainId = keyof typeof SUPPORTED_CHAINS

export function getChainName(chainId: number, chains?: Chain[]): string {
  // First try to find in supported chains
  const supportedChain = SUPPORTED_CHAINS[chainId as SupportedChainId]
  if (supportedChain) {
    return supportedChain.name
  }
  
  // Fallback to provided chains array
  if (chains) {
    const chain = chains.find(c => c.id === chainId)
    if (chain) return chain.name
  }
  
  return `Chain ${chainId}`
}

// Removed external logo dependencies
export function getChainColor(chainId: number): string {
  // Map of chain IDs to colors
  const chainColors: Record<number, string> = {
    // Mainnets
    1: '#627eea', // Ethereum blue
    8453: '#0052ff', // Base blue
    10: '#ff0420', // Optimism red
    42161: '#28a0f0', // Arbitrum blue
    // Testnets (slightly lighter versions)
    11155111: '#8da3f0', // Sepolia (lighter ethereum blue)
    11155420: '#ff5252', // Optimism Sepolia (lighter red)
    84532: '#3366ff', // Base Sepolia (lighter blue)
    421614: '#5cb3f5', // Arbitrum Sepolia (lighter blue)
  }
  
  return chainColors[chainId] || '#627eea'
}

export function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function isSupportedChain(chainId: number): chainId is SupportedChainId {
  return chainId in SUPPORTED_CHAINS
}

export function getSupportedChainIds(): number[] {
  return Object.keys(SUPPORTED_CHAINS).map(Number)
}

export function getChainById(chainId: SupportedChainId) {
  return SUPPORTED_CHAINS[chainId]
}