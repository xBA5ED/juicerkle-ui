import { getPublicClient } from '@wagmi/core'
import { config } from './wagmiConfig'

/**
 * Get a public client for the specified chain using the shared wagmi config
 */
export function getSharedPublicClient(chainId: number) {
  const client = getPublicClient(config)
  if (!client) {
    throw new Error(`No public client available for chain ID: ${chainId}`)
  }
  return client
}
