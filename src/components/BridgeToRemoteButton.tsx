'use client'

import { useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { suckerService } from '@/services/suckerService'
import { bridgeDetectionService } from '@/services/bridgeDetectionService'
import { getChainName } from '@/utils/chainUtils'
import { Send } from './Icons'

interface BridgeToRemoteButtonProps {
  suckerAddress: Address
  tokenAddress: Address
  sourceChainId: number
  targetChainId: number
  transactionCount: number // Keep for interface compatibility
}

export function BridgeToRemoteButton({ 
  suckerAddress, 
  tokenAddress, 
  sourceChainId, 
  targetChainId
  // transactionCount kept for interface compatibility but not used in compact version
}: BridgeToRemoteButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [requiresPayment, setRequiresPayment] = useState(false)
  
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  
  // Detect bridge implementation on component mount
  useEffect(() => {
    const detectBridge = async () => {
      try {
        const paymentRequired = await bridgeDetectionService.requiresPaymentForToRemote(sourceChainId, suckerAddress, targetChainId)
        setRequiresPayment(paymentRequired)
      } catch (error) {
        console.warn('Failed to detect bridge requirements:', error)
        // Use conservative defaults
        setRequiresPayment(true)
      }
    }
    
    detectBridge()
  }, [sourceChainId, suckerAddress, targetChainId])
  
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash
  })

  useEffect(() => {
    if (isConfirming === false && hash) {
      console.log('Bridge to remote transaction confirmed')
      setIsProcessing(false)
      // The existing state monitoring should automatically update the transaction statuses
    }
  }, [isConfirming, hash])

  const handleBridgeToRemote = async () => {
    try {
      setIsProcessing(true)
      
      const contractData = suckerService.getToRemoteFunctionData(tokenAddress, requiresPayment)
      
      writeContract({
        address: suckerAddress,
        abi: contractData.abi,
        functionName: contractData.functionName,
        args: contractData.args,
        value: contractData.value
      })
    } catch (error) {
      console.error('Failed to prepare bridge to remote transaction:', error)
      setIsProcessing(false)
    }
  }

  const isLoading = isPending || isConfirming || isProcessing

  return (
    <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-blue-900 dark:text-blue-100 text-sm">
            Speed Up Bridge
          </span>
        </div>
        <div className="text-xs text-blue-700 dark:text-blue-300">
          {requiresPayment ? '~0.05 ETH + gas' : 'Gas only'}
        </div>
      </div>
      
      <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
        Send to {getChainName(targetChainId)} to make this transaction claimable.
        Anyone can do this, or wait for someone else to pay the gas.
      </p>
      
      <button
        onClick={handleBridgeToRemote}
        disabled={isLoading}
        className="w-full py-2 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {isLoading ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Bridging...' : 'Processing...'}
          </>
        ) : (
          <>
            <Send className="w-3 h-3" />
            Send to {getChainName(targetChainId)}
          </>
        )}
      </button>
      
      {error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          Error: {error.message}
        </div>
      )}
    </div>
  )
}