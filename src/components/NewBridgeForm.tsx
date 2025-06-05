'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { jbTokensService } from '@/services/jbTokensService'
import { jbDirectoryService } from '@/services/jbDirectoryService'
import { suckerDiscoveryService } from '@/services/suckerDiscoveryService'
import { tokenService } from '@/services/tokenService'
import { suckerService } from '@/services/suckerService'
import { bridgeStorageService } from '@/services/bridgeStorageService'
import { SuckerPair } from '@/types/bridge'
import { getChainName } from '@/utils/chainUtils'
import { type Address, parseUnits } from 'viem'

interface NewBridgeFormProps {
    onSuccess?: () => void
    onCancel?: () => void
}

export function NewBridgeForm({ onSuccess, onCancel }: NewBridgeFormProps) {
    const { isConnected, address } = useAccount()
    const chainId = useChainId()
    const { writeContract, data: hash, isPending: isWriting } = useWriteContract()
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
    })

    const [tokenAddress, setTokenAddress] = useState('')
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [projectId, setProjectId] = useState<string | null>(null)
    const [terminalToken, setTerminalToken] = useState<Address | null>(null)
    const [suckerPairs, setSuckerPairs] = useState<SuckerPair[]>([])
    const [selectedPair, setSelectedPair] = useState<SuckerPair | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [step, setStep] = useState<'token' | 'pairs' | 'amount'>('token')

    // Balance and approval state
    const [tokenBalance, setTokenBalance] = useState<bigint>(0n)
    const [tokenAllowance, setTokenAllowance] = useState<bigint>(0n)
    const [tokenDecimals, setTokenDecimals] = useState<number>(18)
    const [hasEnoughBalance, setHasEnoughBalance] = useState(false)
    const [hasEnoughAllowance, setHasEnoughAllowance] = useState(false)
    const [checkingBalance, setCheckingBalance] = useState(false)

    // Bridge transaction state
    const [bridgeTransactionId, setBridgeTransactionId] = useState<string | null>(null)
    const [waitingForEvent, setWaitingForEvent] = useState(false)

    // Reset state when token address changes
    useEffect(() => {
        if (!tokenAddress) {
            setProjectId(null)
            setTerminalToken(null)
            setSuckerPairs([])
            setSelectedPair(null)
            setStep('token')
        }
    }, [tokenAddress])

    // Check balance and allowance when amount or relevant data changes
    useEffect(() => {
        if (step === 'amount' && amount && tokenAddress && selectedPair && address) {
            checkBalanceAndAllowance()
        }
    }, [amount, tokenAddress, selectedPair, address, step])

    // Handle approval confirmation
    useEffect(() => {
        if (isConfirmed) {
            // Recheck allowance after approval is confirmed
            checkBalanceAndAllowance()
        }
    }, [isConfirmed])

    // Update stored transaction with hash when available
    useEffect(() => {
        if (hash && bridgeTransactionId) {
            // Update the stored transaction with the actual hash
            const storedTransaction = bridgeStorageService.getTransactionById(bridgeTransactionId)
            if (storedTransaction) {
                storedTransaction.transactionHash = hash
                bridgeStorageService.storeBridgeTransaction(storedTransaction)
            }
        }
    }, [hash, bridgeTransactionId])

    // Handle bridge transaction confirmation and event listening
    useEffect(() => {
        if (isConfirmed && hash && bridgeTransactionId && selectedPair && chainId) {
            const handleBridgeEvent = async () => {
                try {
                    setWaitingForEvent(true)
                    const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB

                    await suckerService.listenForInsertToOutboxTreeEvent(
                        chainId,
                        suckerInfo.address as Address,
                        hash,
                        (eventData) => {
                            // Update stored transaction with event data
                            bridgeStorageService.updateTransactionWithEventData(hash, {
                                hashed: eventData.hashed,
                                index: eventData.index,
                                root: eventData.root,
                                terminalTokenAmount: eventData.terminalTokenAmount,
                                caller: eventData.caller
                            })

                            console.log('Bridge transaction confirmed with event data:', eventData)
                            setWaitingForEvent(false)

                            // Reset form state
                            setTokenAddress('')
                            setAmount('')
                            setProjectId(null)
                            setTerminalToken(null)
                            setSuckerPairs([])
                            setSelectedPair(null)
                            setBridgeTransactionId(null)
                            setStep('token')
                            setLoading(false)

                            // Show success
                            onSuccess?.()
                        }
                    )
                } catch (error) {
                    console.error('Failed to capture bridge event:', error)
                    setWaitingForEvent(false)
                    setLoading(false)
                }
            }

            handleBridgeEvent()
        }
    }, [isConfirmed, hash, bridgeTransactionId, selectedPair, chainId, onSuccess])

    const handleTokenLookup = async () => {
        if (!tokenAddress || !chainId) {
            setError('Please enter a token address')
            return
        }

        try {
            setLoading(true)
            setError(null)

            // Get project ID for the token
            const foundProjectId = await jbTokensService.getProjectIdForToken(chainId, tokenAddress as Address)

            if (!foundProjectId) {
                setError('Token not found in JBTokens registry')
                return
            }

            setProjectId(foundProjectId)

            // Discover sucker pairs for this project
            const discoveryResult = await suckerDiscoveryService.discoverAllSuckers(chainId, foundProjectId)

            // Filter pairs that include the current chain
            const relevantPairs = Array.from(discoveryResult.suckerPairs.values()).filter(pair =>
                pair.chainA.chainId === chainId || pair.chainB.chainId === chainId
            )

            if (relevantPairs.length === 0) {
                setError('No bridge options found for this token')
                return
            }

            setSuckerPairs(relevantPairs)
            setStep('pairs')
        } catch (err) {
            console.error('Failed to lookup token:', err)
            setError('Failed to lookup token. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const handlePairSelection = async (pair: SuckerPair) => {
        if (!projectId || !chainId) {
            setError('Missing project information')
            return
        }

        try {
            setLoading(true)
            setError(null)
            setSelectedPair(pair)

            // Determine which sucker to use (the one on our current chain)
            const suckerInfo = pair.chainA.chainId === chainId ? pair.chainA : pair.chainB

            // Find a supported terminal token for this sucker
            const supportedToken = await jbDirectoryService.getSupportedTerminalTokenForProject(
                chainId,
                projectId,
                suckerInfo.address as Address
            )

            if (!supportedToken) {
                setError('No supported terminal tokens found for this bridge option')
                setSelectedPair(null)
                return
            }

            setTerminalToken(supportedToken)
            setStep('amount')
        } catch (err) {
            console.error('Failed to validate terminal token for pair:', err)
            setError('Failed to validate bridge option. Please try again.')
            setSelectedPair(null)
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!isConnected || !address) {
            setError('Please connect your wallet first')
            return
        }

        if (!selectedPair || !amount || !terminalToken || !projectId || !chainId) {
            setError('Please complete all steps')
            return
        }

        try {
            setLoading(true)
            setError(null)

            const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
            const destinationChain = getDestinationChain(selectedPair)

            // Generate transaction ID
            const transactionId = bridgeStorageService.generateTransactionId()
            setBridgeTransactionId(transactionId)

            // Prepare the contract call
            const prepareData = suckerService.getPrepareFunctionData({
                projectTokenCount: amount,
                beneficiary: address, // User's address as beneficiary
                minTokensReclaimed: '0', // TODO: Add slippage protection
                token: terminalToken
            }, tokenDecimals)

            // Store initial transaction data
            bridgeStorageService.storeBridgeTransaction({
                id: transactionId,
                transactionHash: '', // Will be updated when transaction is sent
                projectId,
                sourceChainId: chainId,
                targetChainId: destinationChain.chainId,
                suckerAddress: suckerInfo.address as Address,
                beneficiary: address,
                token: terminalToken,
                projectTokenCount: amount,
                terminalTokenAmount: '0', // Will be filled from event
                minTokensReclaimed: '0',
                hashed: '',
                index: '',
                root: '',
                caller: '0x0000000000000000000000000000000000000000' as Address,
                timestamp: Date.now(),
                status: 'pending'
            })

            // Call the prepare function
            writeContract({
                ...prepareData,
                address: suckerInfo.address as Address,
            })

        } catch (err) {
            console.error('Failed to create bridge transaction:', err)
            setError('Failed to initiate bridge. Please try again.')
            setBridgeTransactionId(null)
            setLoading(false)
        }
    }

    const getDestinationChain = (pair: SuckerPair) => {
        return pair.chainA.chainId === chainId ? pair.chainB : pair.chainA
    }

    const checkBalanceAndAllowance = async () => {
        if (!amount || !tokenAddress || !selectedPair || !address || !chainId) {
            return
        }

        try {
            setCheckingBalance(true)
            setError(null)

            const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB

            const result = await tokenService.checkBalanceAndAllowance(
                chainId,
                tokenAddress as Address,
                address,
                suckerInfo.address as Address,
                amount
            )

            setTokenBalance(result.balance)
            setTokenAllowance(result.allowance)
            setTokenDecimals(result.decimals)
            setHasEnoughBalance(result.hasEnoughBalance)
            setHasEnoughAllowance(result.hasEnoughAllowance)

            if (!result.hasEnoughBalance) {
                setError(`Insufficient balance. You have ${tokenService.formatTokenAmount(result.balance, result.decimals)} but need ${amount}`)
            }
        } catch (err) {
            console.error('Failed to check balance and allowance:', err)
            setError('Failed to check token balance and allowance')
        } finally {
            setCheckingBalance(false)
        }
    }

    const handleApproval = async () => {
        if (!selectedPair || !tokenAddress || !amount || !chainId) {
            return
        }

        try {
            const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
            const requiredAmount = parseUnits(amount, tokenDecimals)

            writeContract({
                address: tokenAddress as Address,
                abi: [
                    {
                        name: 'approve',
                        type: 'function',
                        stateMutability: 'nonpayable',
                        inputs: [
                            { name: 'spender', type: 'address' },
                            { name: 'amount', type: 'uint256' }
                        ],
                        outputs: [{ name: '', type: 'bool' }]
                    }
                ],
                functionName: 'approve',
                args: [suckerInfo.address as Address, requiredAmount]
            })
        } catch (err) {
            console.error('Failed to approve token:', err)
            setError('Failed to approve token spending')
        }
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Bridge Juicebox Token</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                    {error}
                </div>
            )}

            {/* Step 1: Token Address Input */}
            {step === 'token' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="tokenAddress">
                            Token Address
                        </label>
                        <div className="flex space-x-2">
                            <input
                                id="tokenAddress"
                                type="text"
                                className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                value={tokenAddress}
                                onChange={(e) => setTokenAddress(e.target.value)}
                                placeholder="0x..."
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={handleTokenLookup}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                                disabled={loading || !tokenAddress || !isConnected}
                            >
                                {loading ? 'Searching...' : 'Find Bridges'}
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Enter the address of a Juicebox project token to find available bridge options
                        </p>
                    </div>
                </div>
            )}

            {/* Step 2: Bridge Options */}
            {step === 'pairs' && suckerPairs.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Available Bridge Options</h3>
                        <button
                            type="button"
                            onClick={() => setStep('token')}
                            className="text-sm text-blue-600 hover:text-blue-700"
                        >
                            ← Change Token
                        </button>
                    </div>

                    {projectId && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <p className="text-sm">
                                <span className="font-medium">Project ID:</span> {projectId} on {getChainName(chainId)}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        {suckerPairs.map((pair) => {
                            const destination = getDestinationChain(pair)
                            return (
                                <button
                                    key={pair.id}
                                    type="button"
                                    onClick={() => handlePairSelection(pair)}
                                    disabled={loading}
                                    className="w-full p-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-500 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">
                                                Bridge to {getChainName(destination.chainId)}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Project ID: {destination.projectId}
                                            </p>
                                        </div>
                                        <div className="text-blue-600">
                                            →
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Step 3: Amount Input */}
            {step === 'amount' && selectedPair && (
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Bridge Amount</h3>
                            <button
                                type="button"
                                onClick={() => setStep('pairs')}
                                className="text-sm text-blue-600 hover:text-blue-700"
                            >
                                ← Change Destination
                            </button>
                        </div>

                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded space-y-1">
                            <p className="text-sm">
                                <span className="font-medium">Bridging to:</span> {getChainName(getDestinationChain(selectedPair).chainId)}
                            </p>
                            {terminalToken && (
                                <p className="text-sm">
                                    <span className="font-medium">Terminal Token:</span> {terminalToken}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1" htmlFor="amount">
                                Amount
                            </label>
                            <input
                                id="amount"
                                type="text"
                                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.0"
                                disabled={loading}
                                required
                                pattern="^[0-9]*[.,]?[0-9]*$"
                            />

                            {/* Balance Information */}
                            {amount && (
                                <div className="mt-2 space-y-1">
                                    {checkingBalance ? (
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Checking balance...
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Balance: {tokenService.formatTokenAmount(tokenBalance, tokenDecimals)}
                                            </p>
                                            {!hasEnoughBalance && tokenBalance > 0n && (
                                                <p className="text-sm text-red-600">
                                                    Insufficient balance
                                                </p>
                                            )}
                                            {hasEnoughBalance && !hasEnoughAllowance && (
                                                <p className="text-sm text-orange-600">
                                                    Approval required (current allowance: {tokenService.formatTokenAmount(tokenAllowance, tokenDecimals)})
                                                </p>
                                            )}
                                            {hasEnoughBalance && hasEnoughAllowance && (
                                                <p className="text-sm text-green-600">
                                                    ✓ Ready to bridge
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                        {onCancel && (
                            <button
                                type="button"
                                className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                onClick={onCancel}
                                disabled={loading || isWriting || isConfirming}
                            >
                                Cancel
                            </button>
                        )}

                        {/* Approval Button */}
                        {hasEnoughBalance && !hasEnoughAllowance && (
                            <button
                                type="button"
                                onClick={handleApproval}
                                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors disabled:opacity-50"
                                disabled={isWriting || isConfirming || checkingBalance}
                            >
                                {isWriting ? 'Approving...' : isConfirming ? 'Confirming...' : 'Approve Token'}
                            </button>
                        )}

                        {/* Bridge Button */}
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                            disabled={loading || !isConnected || !amount || !hasEnoughBalance || !hasEnoughAllowance || checkingBalance || isWriting || isConfirming || waitingForEvent}
                        >
                            {isWriting ? 'Preparing Bridge...' :
                                isConfirming ? 'Confirming...' :
                                    waitingForEvent ? 'Capturing Event...' :
                                        loading ? 'Processing...' :
                                            'Initiate Bridge'}
                        </button>
                    </div>
                </form>
            )}

            {/* Cancel button for non-amount steps */}
            {step !== 'amount' && onCancel && (
                <div className="mt-6 flex justify-end">
                    <button
                        type="button"
                        className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    )
}
