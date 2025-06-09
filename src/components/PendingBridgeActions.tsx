'use client'

import { useEffect, useState } from 'react'
import { type Address } from 'viem'
import { bridgeStorageService, type StoredBridgeTransaction } from '@/services/bridgeStorageService'
import { BridgeToRemoteButton } from './BridgeToRemoteButton'

export function PendingBridgeActions() {
  const [groupedTransactions, setGroupedTransactions] = useState<Map<string, StoredBridgeTransaction[]>>(new Map())

  useEffect(() => {
    const updateGroupedTransactions = () => {
      const grouped = bridgeStorageService.getGroupedTransactionsWaitingToSend()
      setGroupedTransactions(grouped)
    }

    // Initial load
    updateGroupedTransactions()

    // Update every 5 seconds to check for status changes
    const interval = setInterval(updateGroupedTransactions, 5000)

    return () => clearInterval(interval)
  }, [])

  if (groupedTransactions.size === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Pending Bridge Actions
      </h2>
      
      {Array.from(groupedTransactions.entries()).map(([key, transactions]) => {
        if (transactions.length === 0) return null
        
        // All transactions in this group should have the same sucker and token
        const firstTx = transactions[0]
        
        return (
          <BridgeToRemoteButton
            key={key}
            suckerAddress={firstTx.suckerAddress as Address}
            tokenAddress={firstTx.token as Address}
            sourceChainId={firstTx.sourceChainId}
            targetChainId={firstTx.targetChainId}
            transactionCount={transactions.length}
          />
        )
      })}
    </div>
  )
}