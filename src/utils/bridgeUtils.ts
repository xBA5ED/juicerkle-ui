import { type TransactionStatus, type BridgeType, type BridgeDirectionConfig } from '@/types/bridge'

/**
 * Utility functions for bridge-aware transaction state management
 */

/**
 * Get the expected next state after 'sent_to_remote' based on bridge direction config
 */
export function getNextStateAfterSentToRemote(directionConfig: BridgeDirectionConfig): TransactionStatus {
  if (directionConfig.hasAdditionalSteps) {
    // Bridges with additional steps (like L2->L1 with challenge periods) stay in sent_to_remote longer
    return 'sent_to_remote'
  } else {
    // Most bridges go directly to ready_to_claim after sent_to_remote
    return 'ready_to_claim'
  }
}

/**
 * Check if a bridge direction requires payment for toRemote() calls
 */
export function bridgeDirectionRequiresPayment(directionConfig: BridgeDirectionConfig): boolean {
  return directionConfig.requiresPayment
}

/**
 * Check if a bridge direction has additional steps after sent_to_remote
 */
export function bridgeDirectionHasAdditionalSteps(directionConfig: BridgeDirectionConfig): boolean {
  return directionConfig.hasAdditionalSteps
}

/**
 * Get estimated time for bridge completion (in minutes)
 */
export function getBridgeDirectionEstimatedTime(directionConfig: BridgeDirectionConfig): number {
  return directionConfig.estimatedTimeMinutes
}

/**
 * Get bridge-specific warning messages for users based on direction
 */
export function getBridgeDirectionWarnings(bridgeType: BridgeType, directionConfig: BridgeDirectionConfig, direction: 'l1ToL2' | 'l2ToL1' | 'l2ToL2'): string[] {
  const warnings: string[] = []
  
  // L2 to L1 bridges typically have long finalization periods
  if (direction === 'l2ToL1') {
    if (bridgeType === 'ArbitrumCanonical' || bridgeType === 'OptimismCanonical') {
      warnings.push('L2 to L1 transfers require a 7-day challenge period for finalization')
    }
    if (directionConfig.requiresPayment) {
      warnings.push('L2 to L1 transfers require payment for finalization')
    }
  }
  
  // CCIP always requires payment
  if (bridgeType === 'CCIP' && directionConfig.requiresPayment) {
    warnings.push('CCIP bridges require payment for cross-chain transfers')
  }
  
  // Unknown bridges get conservative warnings
  if (bridgeType === 'unknown') {
    warnings.push('Bridge implementation could not be determined')
    warnings.push('Proceed with caution and verify bridge security')
  }
  
  return warnings
}

/**
 * Format estimated time in human-readable format
 */
export function formatEstimatedTime(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} minutes`
  } else if (minutes < 1440) { // Less than 24 hours
    const hours = Math.round(minutes / 60)
    return `~${hours} hour${hours !== 1 ? 's' : ''}`
  } else {
    const days = Math.round(minutes / 1440)
    return `~${days} day${days !== 1 ? 's' : ''}`
  }
}