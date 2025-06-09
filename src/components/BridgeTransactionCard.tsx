'use client'

import { formatUnits } from 'viem'
import { type StoredBridgeTransaction } from '@/services/bridgeStorageService'
import { getChainColor, getChainName } from '@/utils/chainUtils'
import { bridgeStateService } from '@/services/bridgeStateService'
import { useBridgeTransactionState } from '@/hooks/useBridgeStateMonitor'
import { ArrowRight, CheckCircle, Clock, Send } from './Icons'
import { ClaimButton } from './ClaimButton'

interface BridgeTransactionCardProps {
  transaction: StoredBridgeTransaction
}

export function BridgeTransactionCard({ transaction }: BridgeTransactionCardProps) {
  const { sourceChainId, targetChainId, projectTokenCount, token, status, timestamp } = transaction
  
  // Monitor this specific transaction's state
  const { stateInfo } = useBridgeTransactionState(transaction.id)
  
  // Use monitored state if available, otherwise use stored state
  const currentStatus = stateInfo?.currentStatus || status
  const isClaimable = currentStatus === 'ready_to_claim'
  
  // Helper functions for status display
  const getStatusIcon = () => {
    switch (currentStatus) {
      case 'pending':
        return <Clock className="w-4 h-4" />
      case 'confirmed':
        return <Clock className="w-4 h-4" />
      case 'waiting_to_send':
        return <Clock className="w-4 h-4" />
      case 'sent_to_remote':
        return <Send className="w-4 h-4" />
      case 'ready_to_claim':
        return <CheckCircle className="w-4 h-4" />
      case 'claimed':
        return <CheckCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getStatusColor = () => {
    switch (currentStatus) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'confirmed':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'waiting_to_send':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'sent_to_remote':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'ready_to_claim':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'claimed':
        return 'text-gray-600 bg-gray-50 border-gray-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusText = () => {
    switch (currentStatus) {
      case 'pending':
        return 'Confirming'
      case 'confirmed':
        return 'Confirmed'
      case 'waiting_to_send':
        return 'Waiting to send'
      case 'sent_to_remote':
        return 'Sent to destination'
      case 'ready_to_claim':
        return 'Ready to claim'
      case 'claimed':
        return 'Completed'
      default:
        return 'Processing'
    }
  }

  const formatAmount = () => {
    try {
      // Assume 18 decimals for project tokens (most common)
      const formatted = formatUnits(BigInt(projectTokenCount), 18)
      return parseFloat(formatted).toLocaleString(undefined, { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 4 
      })
    } catch {
      return projectTokenCount
    }
  }

  const formatDate = () => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-800 dark:border-gray-700">
      {/* Header with status */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {formatDate()}
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor()}`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </div>
      </div>
      
      {/* Amount */}
      <div className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
        {formatAmount()} <span className="text-sm text-gray-500">Project Tokens</span>
      </div>
      
      {/* Chain route */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col items-center">
          <div 
            className="w-8 h-8 relative rounded-full overflow-hidden flex items-center justify-center mb-1 text-white text-xs font-bold"
            style={{ backgroundColor: getChainColor(sourceChainId) }}
          >
            {getChainName(sourceChainId).substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {getChainName(sourceChainId)}
          </span>
        </div>
        
        <ArrowRight className="text-gray-400 mx-4" />
        
        <div className="flex flex-col items-center">
          <div 
            className="w-8 h-8 relative rounded-full overflow-hidden flex items-center justify-center mb-1 text-white text-xs font-bold"
            style={{ backgroundColor: getChainColor(targetChainId) }}
          >
            {getChainName(targetChainId).substring(0, 2).toUpperCase()}
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {getChainName(targetChainId)}
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${bridgeStateService.getStatusProgress(currentStatus)}%` }}
          ></div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {bridgeStateService.getStatusDescription(currentStatus)}
        </div>
      </div>

      {/* Transaction details */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <div>Project ID: {transaction.projectId}</div>
        <div className="truncate">TX: {transaction.transactionHash.slice(0, 10)}...{transaction.transactionHash.slice(-8)}</div>
        {stateInfo?.outboxIndex !== undefined && (
          <div>Position: {stateInfo.outboxIndex} / {stateInfo.numberOfClaimsSent} sent</div>
        )}
      </div>
      
      {/* Action button */}
      {isClaimable && (
        <div className="mt-4">
          <ClaimButton transaction={transaction} />
        </div>
      )}
    </div>
  )
}