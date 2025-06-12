import { type TransactionStatus, type BridgeType } from '@/types/bridge'

/**
 * Utility functions for bridge-aware transaction state management
 */

/**
 * Get the expected next state after 'sent_to_remote' based on bridge type
 */
export function getNextStateAfterSentToRemote(bridgeType: BridgeType): TransactionStatus {
  switch (bridgeType) {
    case 'CCIP':
      // CCIP may have additional steps before ready_to_claim
      return 'sent_to_remote' // Stay in sent_to_remote until additional steps complete
    case 'ArbitrumCanonical':
    case 'OptimismCanonical':
    case 'unknown':
    default:
      // Most bridges go directly to ready_to_claim after sent_to_remote
      return 'ready_to_claim'
  }
}

/**
 * Check if a bridge type requires payment for toRemote() calls
 */
export function bridgeRequiresPayment(bridgeType: BridgeType): boolean {
  switch (bridgeType) {
    case 'CCIP':
      return true
    case 'ArbitrumCanonical':
    case 'OptimismCanonical':
      return false
    case 'unknown':
    default:
      return true // Conservative default
  }
}

/**
 * Check if a bridge type has additional steps after sent_to_remote
 */
export function bridgeHasAdditionalSteps(bridgeType: BridgeType): boolean {
  switch (bridgeType) {
    case 'CCIP':
      return true
    case 'ArbitrumCanonical':
    case 'OptimismCanonical':
      return false
    case 'unknown':
    default:
      return true // Conservative default
  }
}

/**
 * Get estimated time for bridge completion (in minutes)
 */
export function getBridgeEstimatedTime(bridgeType: BridgeType): number {
  switch (bridgeType) {
    case 'ArbitrumCanonical':
      return 10 // ~10 minutes for Arbitrum
    case 'OptimismCanonical':
      return 5 // ~5 minutes for Optimism
    case 'CCIP':
      return 20 // ~20 minutes for CCIP
    case 'unknown':
    default:
      return 15 // Conservative estimate
  }
}

/**
 * Get bridge-specific warning messages for users
 */
export function getBridgeWarnings(bridgeType: BridgeType): string[] {
  const warnings: string[] = []
  
  switch (bridgeType) {
    case 'CCIP':
      warnings.push('CCIP bridges require payment for cross-chain transfers')
      warnings.push('Additional verification steps may be required')
      break
    case 'unknown':
      warnings.push('Bridge implementation could not be determined')
      warnings.push('Proceed with caution and verify bridge security')
      break
    case 'ArbitrumCanonical':
    case 'OptimismCanonical':
      // These are generally safe, no warnings needed
      break
  }
  
  return warnings
}