import { createConfig, http } from 'wagmi'
import { 
  mainnet, 
  optimism, 
  base, 
  arbitrum,
  sepolia,
  optimismSepolia,
  baseSepolia,
  arbitrumSepolia
} from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [
    // Mainnets
    mainnet, 
    optimism, 
    base, 
    arbitrum,
    // Testnets
    sepolia,
    optimismSepolia,
    baseSepolia,
    arbitrumSepolia
  ],
  transports: {
    // Mainnets
    [mainnet.id]: http(),
    [optimism.id]: http(),
    [base.id]: http('https://base.llamarpc.com'),
    [arbitrum.id]: http(),
    // Testnets
    [sepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
  connectors: [
    injected()
  ],
})