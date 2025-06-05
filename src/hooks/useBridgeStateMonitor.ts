import { useState, useEffect, useCallback, useRef } from 'react'
import { bridgeStateService, type BridgeStateInfo } from '@/services/bridgeStateService'
import { bridgeStorageService } from '@/services/bridgeStorageService'

interface UseBridgeStateMonitorOptions {
  intervalMs?: number // Default 30 seconds
  chainId?: number // Optional: only monitor specific chain
  enabled?: boolean // Default true
}

interface BridgeStateMonitorResult {
  stateInfos: BridgeStateInfo[]
  isChecking: boolean
  lastCheckTime: Date | null
  checkNow: () => Promise<void>
  error: string | null
}

export function useBridgeStateMonitor(
  options: UseBridgeStateMonitorOptions = {}
): BridgeStateMonitorResult {
  const { intervalMs = 30000, chainId, enabled = true } = options
  
  const [stateInfos, setStateInfos] = useState<BridgeStateInfo[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const checkStates = useCallback(async () => {
    if (isChecking) {
      return // Prevent concurrent checks
    }
    
    setIsChecking(true)
    setError(null)
    
    try {
      let results: BridgeStateInfo[]
      
      if (chainId) {
        results = await bridgeStateService.checkTransactionStatesForChain(chainId)
      } else {
        results = await bridgeStateService.checkAllTransactionStates()
      }
      
      setStateInfos(results)
      setLastCheckTime(new Date())
      
      // Only log status changes to reduce noise
      const statusChanges = results.filter(info => info.statusChanged)
      if (statusChanges.length > 0) {
        console.log('Bridge state changes detected:', statusChanges)
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check bridge states'
      setError(errorMessage)
      console.error('Bridge state check failed:', err)
    } finally {
      setIsChecking(false)
    }
  }, [chainId]) // Removed isChecking from dependencies to prevent recreation

  // Initial check and periodic polling
  useEffect(() => {
    if (!enabled) return

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Check immediately
    checkStates()

    // Set up interval
    intervalRef.current = setInterval(checkStates, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, intervalMs]) // Removed checkStates from dependencies

  // Listen for storage changes to trigger re-checks (throttled)
  useEffect(() => {
    if (!enabled) return

    let timeoutId: NodeJS.Timeout | null = null

    const handleStorageChange = (e: StorageEvent) => {
      // Only respond to our bridge transactions storage changes
      if (e.key !== 'juicerkle-bridge-transactions') return
      
      // Clear existing timeout
      if (timeoutId) clearTimeout(timeoutId)
      
      // Throttle: wait 2 seconds after last storage change
      timeoutId = setTimeout(() => {
        checkStates()
      }, 2000)
    }

    // Listen for localStorage changes (new transactions added)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [enabled]) // Removed checkStates from dependencies

  return {
    stateInfos,
    isChecking,
    lastCheckTime,
    checkNow: checkStates,
    error
  }
}

// Hook for monitoring a specific transaction
export function useBridgeTransactionState(transactionId: string | null) {
  const [stateInfo, setStateInfo] = useState<BridgeStateInfo | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkTransactionState = useCallback(async () => {
    if (!transactionId || isChecking) return

    setIsChecking(true)
    setError(null)

    try {
      const transaction = bridgeStorageService.getTransactionById(transactionId)
      if (!transaction) {
        setStateInfo(null)
        return
      }

      const result = await bridgeStateService.checkTransactionState(transaction)
      setStateInfo(result)

      if (result.statusChanged) {
        console.log(`Transaction ${transactionId} status changed:`, {
          from: result.previousStatus,
          to: result.currentStatus
        })
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check transaction state'
      setError(errorMessage)
      console.error(`Failed to check state for transaction ${transactionId}:`, err)
    } finally {
      setIsChecking(false)
    }
  }, [transactionId, isChecking])

  useEffect(() => {
    if (!transactionId) return

    // Check immediately
    checkTransactionState()

    // Set up interval (shorter for single transaction)
    const interval = setInterval(checkTransactionState, 15000)

    return () => clearInterval(interval)
  }, [transactionId, checkTransactionState])

  return {
    stateInfo,
    isChecking,
    checkNow: checkTransactionState,
    error
  }
}