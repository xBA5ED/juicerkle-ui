'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { type StoredBridgeTransaction } from '@/services/bridgeStorageService'
import { suckerService } from '@/services/suckerService'
import { bridgeStorageService } from '@/services/bridgeStorageService'
import { getChainName } from '@/utils/chainUtils'

interface ClaimButtonProps {
  transaction: StoredBridgeTransaction
  onSuccess?: () => void
}

export function ClaimButton({ transaction, onSuccess }: ClaimButtonProps) {
  const { address, chainId } = useAccount()
  const { writeContract, data: hash, error, isPending } = useWriteContract()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  const [claiming, setClaiming] = useState(false)
  const [waitingForEvent, setWaitingForEvent] = useState(false)

  const isOnCorrectChain = chainId === transaction.targetChainId
  const isCorrectBeneficiary = address?.toLowerCase() === transaction.beneficiary.toLowerCase()
  const isReadyToClaim = transaction.status === 'ready_to_claim' && transaction.claimProof && transaction.claimLeaf
  
  // Button is enabled if: ready to claim AND correct beneficiary AND (on correct chain OR can switch chains)
  const canInteract = isCorrectBeneficiary && isReadyToClaim && !claiming && !isPending && !isConfirming && !waitingForEvent && !isSwitchingChain

  const handleButtonClick = async () => {
    // If not on correct chain, switch chains first
    if (!isOnCorrectChain) {
      try {
        await switchChain({ chainId: transaction.targetChainId })
      } catch (error) {
        console.error('Failed to switch chain:', error)
      }
      return
    }

    // Otherwise, proceed with claim
    await handleClaim()
  }

  const handleClaim = async () => {
    if (!isReadyToClaim || !transaction.claimProof || !transaction.claimLeaf) {
      console.error('Transaction not ready to claim')
      return
    }

    try {
      setClaiming(true)

      // Construct the claim data from stored transaction
      const claimData = {
        Token: transaction.token,
        Leaf: transaction.claimLeaf,
        Proof: transaction.claimProof
      }

      console.log('Claiming transaction:', transaction.id)
      console.log('Claim data:', claimData)

      // Get contract call data
      const contractData = suckerService.getClaimFunctionData(claimData)

      // Execute the claim transaction
      writeContract({
        address: transaction.suckerAddress,
        abi: contractData.abi,
        functionName: contractData.functionName,
        args: contractData.args
      })

    } catch (error) {
      console.error('Failed to claim:', error)
      setClaiming(false)
    }
  }

  // Listen for claim event when transaction is confirmed
  useEffect(() => {
    if (isConfirmed && hash && !waitingForEvent && transaction.status !== 'claimed') {
      setWaitingForEvent(true)
      
      // Listen for the Claim event to confirm the claim was successful
      suckerService.listenForClaimEvent(
        transaction.targetChainId,
        transaction.suckerAddress,
        hash,
        (eventData) => {
          console.log('Claim event received:', eventData)
          // Update transaction status to claimed
          bridgeStorageService.updateTransactionStatus(transaction.id, 'claimed')
          setWaitingForEvent(false)
          setClaiming(false)
          onSuccess?.()
        }
      ).catch((error) => {
        console.error('Failed to listen for claim event:', error)
        // Even if event listening fails, we can assume the claim was successful since the transaction was confirmed
        bridgeStorageService.updateTransactionStatus(transaction.id, 'claimed')
        setWaitingForEvent(false)
        setClaiming(false)
        onSuccess?.()
      })
    }
  }, [isConfirmed, hash, waitingForEvent, transaction, onSuccess])

  // Reset claiming state if transaction fails
  if (error && claiming) {
    setClaiming(false)
    setWaitingForEvent(false)
  }

  const getButtonText = () => {
    if (!isOnCorrectChain) {
      return `Switch to ${getChainName(transaction.targetChainId)}`
    }
    if (!isCorrectBeneficiary) {
      return 'Not your transaction'
    }
    if (!isReadyToClaim) {
      return 'Not ready to claim'
    }
    if (isPending) {
      return 'Confirm in wallet...'
    }
    if (isConfirming) {
      return 'Claiming...'
    }
    if (waitingForEvent) {
      return 'Processing claim...'
    }
    if (isConfirmed) {
      return 'Claimed!'
    }
    return 'Claim Tokens'
  }

  const getButtonColor = () => {
    if (!canInteract) {
      return 'bg-gray-400 cursor-not-allowed'
    }
    if (isConfirmed) {
      return 'bg-green-600'
    }
    return 'bg-blue-600 hover:bg-blue-700'
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleButtonClick}
        disabled={!canInteract}
        className={`w-full px-4 py-2 text-white rounded-md transition-colors ${getButtonColor()}`}
      >
        {getButtonText()}
      </button>

      {error && (
        <p className="text-sm text-red-600">
          Error: {error.message}
        </p>
      )}

      {!isCorrectBeneficiary && address && (
        <p className="text-sm text-gray-600">
          This transaction can only be claimed by {transaction.beneficiary}
        </p>
      )}
    </div>
  )
}
