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
  transactionCount: number
}

export function BridgeToRemoteButton({ 
  suckerAddress, 
  tokenAddress, 
  sourceChainId, 
  targetChainId, 
  transactionCount 
}: BridgeToRemoteButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [requiresPayment, setRequiresPayment] = useState(false)
  const [bridgeName, setBridgeName] = useState<string>('Unknown Bridge')
  
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  
  // Detect bridge implementation on component mount
  useEffect(() => {
    const detectBridge = async () => {
      try {
        const [paymentRequired, displayName] = await Promise.all([
          bridgeDetectionService.requiresPaymentForToRemote(sourceChainId, suckerAddress),
          bridgeDetectionService.getBridgeDisplayName(sourceChainId, suckerAddress)
        ])
        
        setRequiresPayment(paymentRequired)
        setBridgeName(displayName)
      } catch (error) {
        console.warn('Failed to detect bridge requirements:', error)
        // Use conservative defaults
        setRequiresPayment(true)
        setBridgeName('Unknown Bridge')
      }
    }
    
    detectBridge()
  }, [sourceChainId, suckerAddress])
  
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
    onSuccess: () => {
      console.log('Bridge to remote transaction confirmed')
      setIsProcessing(false)
      // The existing state monitoring should automatically update the transaction statuses
    },
    onError: (error) => {
      console.error('Bridge to remote transaction failed:', error)
      setIsProcessing(false)
    }
  })

  const handleBridgeToRemote = async () => {
    try {
      setIsProcessing(true)
      
      const contractData = suckerService.getToRemoteFunctionData(tokenAddress)
      
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
    <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium text-blue-900 dark:text-blue-100">
            Speed Up Bridge
          </h3>
        </div>
        <div className="text-sm text-blue-700 dark:text-blue-300">
          {transactionCount} transaction{transactionCount !== 1 ? 's' : ''} waiting
        </div>
      </div>
      
      <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
        Send the merkle root to {getChainName(targetChainId)} to make all pending transactions claimable.
        Anyone can do this, or you can wait for someone else to pay the gas.
        <br />
        <span className="font-medium">
          Bridge: {bridgeName}
          {requiresPayment ? ' • Cost: ~0.05 ETH + gas fees' : ' • Free (gas only)'}
        </span>
        {requiresPayment && (
          <span className="block text-orange-600 dark:text-orange-400 text-xs mt-1">
            ⚠️ This bridge requires payment for cross-chain transfers
          </span>
        )}
      </p>
      
      <button
        onClick={handleBridgeToRemote}
        disabled={isLoading}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Bridging...' : 'Processing...'}
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Send to {getChainName(targetChainId)}
          </>
        )}
      </button>
      
      {error && (
        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
          Error: {error.message}
        </div>
      )}
    </div>
  )
}