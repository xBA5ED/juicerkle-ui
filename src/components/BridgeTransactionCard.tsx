'use client'

import { useState } from 'react'
import { type StoredBridgeTransaction } from '@/services/bridgeStorageService'
import { getChainName } from '@/utils/chainUtils'
import { bridgeStateService } from '@/services/bridgeStateService'
import { useBridgeTransactionState } from '@/hooks/useBridgeStateMonitor'
import { ArrowRight, CheckCircle, Clock, Send, ChevronDown, ChevronUp } from './Icons'
import { ClaimButton } from './ClaimButton'
import { BridgeToRemoteButton } from './BridgeToRemoteButton'
import { ChainLogo } from './ChainLogo'

interface BridgeTransactionCardProps {
  transaction: StoredBridgeTransaction
}

export function BridgeTransactionCard({ transaction }: BridgeTransactionCardProps) {
  const { sourceChainId, targetChainId, projectTokenCount, status, timestamp } = transaction
  const [showDetails, setShowDetails] = useState(false)
  
  // Monitor this specific transaction's state
  const { stateInfo } = useBridgeTransactionState(transaction.id)
  
  // Use monitored state if available, otherwise use stored state
  const currentStatus = stateInfo?.currentStatus || status
  const isClaimable = currentStatus === 'ready_to_claim'
  const canSpeedUp = currentStatus === 'waiting_to_send'
  
  // Helper functions for status display
  const getStatusIcon = () => {
    switch (currentStatus) {
      case 'initiated':
      case 'waiting_to_send':
        return <Clock className="w-4 h-4" />
      case 'sent_to_remote':
        return <Send className="w-4 h-4" />
      case 'ready_to_claim':
      case 'claimed':
        return <CheckCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getStatusColor = () => {
    switch (currentStatus) {
      case 'initiated':
      case 'waiting_to_send':
        return 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
      case 'sent_to_remote':
        return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
      case 'ready_to_claim':
        return 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
      case 'claimed':
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800'
    }
  }

  const getStatusText = () => {
    switch (currentStatus) {
      case 'initiated':
        return 'Initiated'
      case 'waiting_to_send':
        return 'Ready to bridge'
      case 'sent_to_remote':
        return 'Bridging...'
      case 'ready_to_claim':
        return 'Ready to claim'
      case 'claimed':
        return 'Completed'
      default:
        return 'Processing'
    }
  }

  const getStatusDescription = () => {
    switch (currentStatus) {
      case 'initiated':
      case 'waiting_to_send':
        return 'Waiting to be sent to destination chain'
      case 'sent_to_remote':
        return 'Being processed on destination chain'
      case 'ready_to_claim':
        return 'Ready to claim on destination chain'
      case 'claimed':
        return 'Successfully completed'
      default:
        return 'Processing...'
    }
  }

  const formatAmount = () => {
    try {
      // projectTokenCount is stored as a string and represents the user input amount
      // It should already be in human-readable format (e.g., "190" not "190000000000000000000")
      const num = parseFloat(projectTokenCount)
      
      if (isNaN(num)) {
        return '0'
      }
      
      return num.toLocaleString(undefined, { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 4 
      })
    } catch (error) {
      console.error('Error formatting amount:', error)
      return '0'
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

  const getTimeAgo = () => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  return (
    <div className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-800 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ChainLogo chainId={sourceChainId} chainName={getChainName(sourceChainId)} size="sm" />
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <ChainLogo chainId={targetChainId} chainName={getChainName(targetChainId)} size="sm" />
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {formatAmount()} tokens
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              to {getChainName(targetChainId)}
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor()}`}>
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {getTimeAgo()}
          </div>
        </div>
      </div>
      
      {/* Status Description */}
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {getStatusDescription()}
      </div>
      
      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${bridgeStateService.getStatusProgress(currentStatus)}%` }}
          ></div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Speed Up Bridge Button */}
        {canSpeedUp && (
          <BridgeToRemoteButton
            suckerAddress={transaction.suckerAddress}
            tokenAddress={transaction.token}
            sourceChainId={sourceChainId}
            targetChainId={targetChainId}
            transactionCount={1}
          />
        )}
        
        {/* Claim Button */}
        {isClaimable && (
          <ClaimButton transaction={transaction} />
        )}
      </div>

      {/* Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center justify-center gap-1"
      >
        {showDetails ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            Show details
          </>
        )}
      </button>

      {/* Detailed Information */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300">Project ID</div>
                <div>{transaction.projectId}</div>
              </div>
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300">Date</div>
                <div>{formatDate()}</div>
              </div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Transaction Hash</div>
              <div className="font-mono break-all">{transaction.transactionHash}</div>
            </div>
            
            {transaction.bridgeInfo && (
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300">Bridge</div>
                <div>{transaction.bridgeInfo.bridgeInfo.displayName}</div>
              </div>
            )}
            
            {stateInfo?.outboxIndex !== undefined && (
              <div>
                <div className="font-medium text-gray-700 dark:text-gray-300">Queue Position</div>
                <div>{stateInfo.outboxIndex} / {stateInfo.numberOfClaimsSent} sent</div>
              </div>
            )}
            
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Terminal Token</div>
              <div className="font-mono break-all">{transaction.token}</div>
            </div>
            
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Beneficiary</div>
              <div className="font-mono break-all">{transaction.beneficiary}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}