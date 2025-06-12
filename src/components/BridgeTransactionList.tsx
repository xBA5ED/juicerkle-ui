'use client'

import { useEffect, useState } from 'react'
import { BridgeTransactionCard } from './BridgeTransactionCard'
import { bridgeStorageService, type StoredBridgeTransaction } from '@/services/bridgeStorageService'
import { useBridgeStateMonitor } from '@/hooks/useBridgeStateMonitor'

export function BridgeTransactionList() {
  const [transactions, setTransactions] = useState<StoredBridgeTransaction[]>([])
  const [loading, setLoading] = useState(true)
  
  // Monitor bridge states with auto-refresh every 30 seconds
  const { stateInfos, isChecking, lastCheckTime } = useBridgeStateMonitor({
    intervalMs: 30000,
    enabled: true
  })
  
  const loadTransactions = () => {
    try {
      setLoading(true)
      
      // Remove any duplicates before loading
      bridgeStorageService.removeDuplicateTransactions()
      
      const storedTransactions = bridgeStorageService.getAllTransactions()
      
      // Filter out claimed transactions and sort by timestamp (newest first)
      const activeTransactions = storedTransactions.filter(tx => tx.status !== 'claimed')
      const sortedTransactions = activeTransactions.sort((a, b) => b.timestamp - a.timestamp)
      setTransactions(sortedTransactions)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    // Load initially
    loadTransactions()
    
    // Listen for localStorage changes (when new transactions are added from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'juicerkle-bridge-transactions') {
        loadTransactions()
      }
    }
    
    // Listen for custom events (when new transactions are added in same tab)
    const handleCustomStorageChange = () => {
      loadTransactions()
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('bridge-transactions-updated', handleCustomStorageChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('bridge-transactions-updated', handleCustomStorageChange)
    }
  }, [])
  
  // Refresh when state monitoring detects changes
  useEffect(() => {
    if (stateInfos.length > 0) {
      loadTransactions()
    }
  }, [stateInfos, lastCheckTime])
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    )
  }
  
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No bridge transactions found.</p>
        <p className="text-sm mt-2">Your bridge transactions will appear here once you start bridging tokens.</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      {/* Status Monitor Info */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          {isChecking && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 animate-spin rounded-full border-2 border-current border-r-transparent"></div>
              <span>Checking states...</span>
            </div>
          )}
          {lastCheckTime && !isChecking && (
            <span>Last updated: {lastCheckTime.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
      
      {/* Transaction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {transactions.map(transaction => (
          <BridgeTransactionCard 
            key={transaction.id} 
            transaction={transaction}
          />
        ))}
      </div>
    </div>
  )
}