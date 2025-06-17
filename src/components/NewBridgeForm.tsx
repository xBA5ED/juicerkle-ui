'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { jbTokensService } from '@/services/jbTokensService'
import { jbDirectoryService } from '@/services/jbDirectoryService'
import { suckerDiscoveryService } from '@/services/suckerDiscoveryService'
import { tokenService } from '@/services/tokenService'
import { suckerService } from '@/services/suckerService'
import { bridgeStorageService } from '@/services/bridgeStorageService'
import { bridgeDetectionService } from '@/services/bridgeDetectionService'
import { SuckerPair } from '@/types/bridge'
import { getChainName } from '@/utils/chainUtils'
import { ChainLogo } from './ChainLogo'
import { ArrowRight, CheckCircle, AlertCircle, Loader } from './Icons'
import { type Address, parseUnits, formatUnits } from 'viem'

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

    // Form state
    const [step, setStep] = useState<'token' | 'pairs' | 'amount'>('token')
    const [tokenAddress, setTokenAddress] = useState('')
    const [amount, setAmount] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Discovery results
    const [projectId, setProjectId] = useState<string | null>(null)
    const [suckerPairs, setSuckerPairs] = useState<SuckerPair[]>([])
    const [selectedPair, setSelectedPair] = useState<SuckerPair | null>(null)
    const [terminalToken, setTerminalToken] = useState<Address | null>(null)
    
    // Token state
    const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0))
    const [tokenAllowance, setTokenAllowance] = useState<bigint>(BigInt(0))
    const [tokenDecimals, setTokenDecimals] = useState<number>(18)
    const [balanceLoaded, setBalanceLoaded] = useState(false)
    
    // Transaction state
    const [bridgeTransactionId, setBridgeTransactionId] = useState<string | null>(null)
    const [waitingForEvent, setWaitingForEvent] = useState(false)
    const [approvalStep, setApprovalStep] = useState<'none' | 'needed' | 'pending' | 'confirmed'>('none')

    // Load balance when we have all required info
    useEffect(() => {
        const loadBalance = async () => {
            if (!tokenAddress || !address || !chainId || !selectedPair) return
            
            try {
                setBalanceLoaded(false)
                const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
                
                const result = await tokenService.checkBalanceAndAllowance(
                    chainId,
                    tokenAddress as Address,
                    address,
                    suckerInfo.address as Address,
                    '0' // Just get current state
                )
                
                setTokenBalance(result.balance)
                setTokenAllowance(result.allowance)
                setTokenDecimals(result.decimals)
                setBalanceLoaded(true)
            } catch (err) {
                console.error('Failed to load balance:', err)
            }
        }
        
        loadBalance()
    }, [tokenAddress, address, chainId, selectedPair])

    // Handle bridge transaction confirmation and event listening
    useEffect(() => {
        const handleBridgeEvent = async () => {
            if (isConfirmed && hash && bridgeTransactionId && selectedPair && terminalToken && address && amount) {
                try {
                    setWaitingForEvent(true)
                    
                    const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
                    const destinationChain = selectedPair.chainA.chainId === chainId ? selectedPair.chainB : selectedPair.chainA

                    await suckerService.listenForInsertToOutboxTreeEvent(
                        chainId,
                        suckerInfo.address as Address,
                        hash,
                        async (eventData) => {
                            let bridgeInfo
                            try {
                                bridgeInfo = await bridgeDetectionService.detectSuckerBridge(
                                    chainId,
                                    suckerInfo.address as Address
                                )
                            } catch (error) {
                                console.warn('Failed to detect bridge implementation:', error)
                            }
                            
                            bridgeStorageService.storeBridgeTransaction({
                                id: bridgeTransactionId,
                                transactionHash: hash,
                                projectId: projectId!,
                                sourceChainId: chainId,
                                targetChainId: destinationChain.chainId,
                                suckerAddress: suckerInfo.address as Address,
                                beneficiary: address,
                                token: terminalToken,
                                projectTokenCount: amount,
                                terminalTokenAmount: eventData.terminalTokenAmount,
                                minTokensReclaimed: '0',
                                bridgeInfo,
                                hashed: eventData.hashed,
                                index: eventData.index,
                                root: eventData.root,
                                caller: eventData.caller,
                                claimProof: null,
                                claimLeaf: null,
                                timestamp: Date.now(),
                                status: 'waiting_to_send'
                            })

                            setWaitingForEvent(false)
                            setLoading(false)
                            
                            // Reset form
                            setTokenAddress('')
                            setAmount('')
                            setStep('token')
                            setSelectedPair(null)
                            setProjectId(null)
                            setSuckerPairs([])
                            setTerminalToken(null)
                            setBridgeTransactionId(null)
                            
                            onSuccess?.()
                        }
                    )
                } catch (error) {
                    console.error('Failed to listen for bridge event:', error)
                    setError('Failed to confirm bridge transaction')
                    setWaitingForEvent(false)
                    setLoading(false)
                }
            }
        }

        handleBridgeEvent()
    }, [isConfirmed, hash, bridgeTransactionId, selectedPair, terminalToken, address, amount, chainId, projectId, onSuccess])

    // Check approval status when amount changes
    useEffect(() => {
        console.log('Checking approval status:', { amount, tokenBalance: tokenBalance.toString(), tokenAllowance: tokenAllowance.toString(), tokenDecimals })
        
        if (!amount || tokenBalance === undefined || tokenAllowance === undefined || !tokenDecimals) {
            console.log('Missing required values, setting approval to none')
            setApprovalStep('none')
            return
        }
        
        try {
            const requiredAmount = parseUnits(amount, tokenDecimals)
            const hasBalance = tokenBalance >= requiredAmount
            const hasAllowance = tokenAllowance >= requiredAmount
            
            console.log('Approval check:', {
                requiredAmount: requiredAmount.toString(),
                hasBalance,
                hasAllowance,
                tokenBalance: tokenBalance.toString(),
                tokenAllowance: tokenAllowance.toString()
            })
            
            if (!hasBalance) {
                console.log('Insufficient balance')
                setApprovalStep('none')
                setError(`Insufficient balance. You have ${formatUnits(tokenBalance, tokenDecimals)} tokens`)
            } else if (!hasAllowance) {
                console.log('Sufficient balance but insufficient allowance - approval needed')
                setApprovalStep('needed')
                setError(null)
            } else {
                console.log('Both balance and allowance sufficient - confirmed')
                setApprovalStep('confirmed')
                setError(null)
            }
        } catch (error) {
            console.error('Error in approval check:', error)
            setApprovalStep('none')
        }
    }, [amount, tokenBalance, tokenAllowance, tokenDecimals])

    // Handle approval confirmation
    useEffect(() => {
        if (isConfirmed && hash && approvalStep === 'pending') {
            console.log('Approval transaction confirmed, updating allowance...')
            setApprovalStep('confirmed')
            
            // Reload allowance after approval
            if (tokenAddress && address && selectedPair) {
                const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
                tokenService.getTokenAllowance(chainId, tokenAddress as Address, address, suckerInfo.address as Address)
                    .then((newAllowance) => {
                        console.log('Updated allowance:', newAllowance.toString())
                        setTokenAllowance(newAllowance)
                    })
                    .catch(console.error)
            }
        }
    }, [isConfirmed, hash, approvalStep, tokenAddress, address, selectedPair, chainId])

    const handleTokenLookup = async () => {
        if (!tokenAddress || !chainId) {
            setError('Please enter a token address')
            return
        }

        try {
            setLoading(true)
            setError(null)

            const foundProjectId = await jbTokensService.getProjectIdForToken(chainId, tokenAddress as Address)
            if (!foundProjectId) {
                setError('Token not found in JBTokens registry')
                return
            }

            setProjectId(foundProjectId)

            console.log('Discovering suckers and detecting bridge types...')
            const discoveryResult = await suckerDiscoveryService.discoverAllSuckers(chainId, foundProjectId)
            const relevantPairs = Array.from(discoveryResult.suckerPairs.values()).filter(pair =>
                pair.chainA.chainId === chainId || pair.chainB.chainId === chainId
            )

            if (relevantPairs.length === 0) {
                setError('No bridge options found for this token')
                return
            }

            // Check if any CCIP bridges are available
            const ccipPairs = relevantPairs.filter(pair => {
                const sourceChain = pair.chainA.chainId === chainId ? pair.chainA : pair.chainB
                return sourceChain.bridgeInfo?.bridgeInfo.type === 'CCIP'
            })

            if (ccipPairs.length === 0) {
                setError('No CCIP bridges available for this token. Only CCIP bridges are currently supported.')
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
        try {
            setLoading(true)
            setError(null)
            setSelectedPair(pair)

            const suckerInfo = pair.chainA.chainId === chainId ? pair.chainA : pair.chainB
            const supportedToken = await jbDirectoryService.getSupportedTerminalTokenForProject(
                chainId,
                projectId!,
                suckerInfo.address as Address
            )

            if (!supportedToken) {
                setError('No supported terminal token found for this bridge')
                return
            }

            setTerminalToken(supportedToken)
            setStep('amount')
        } catch (err) {
            console.error('Failed to validate bridge option:', err)
            setError('Failed to validate bridge option')
        } finally {
            setLoading(false)
        }
    }

    const handleMaxAmount = () => {
        if (tokenBalance && tokenDecimals) {
            const maxAmount = formatUnits(tokenBalance, tokenDecimals)
            setAmount(maxAmount)
        }
    }

    const handleApproval = async (isInfinite: boolean = false) => {
        if (!selectedPair || !tokenAddress || !amount) return

        try {
            setApprovalStep('pending')
            const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
            
            // Use proper max uint256 value
            const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
            const approvalAmount = isInfinite 
                ? maxUint256
                : parseUnits(amount, tokenDecimals)

            console.log('Approving amount:', approvalAmount.toString(), 'for spender:', suckerInfo.address)

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
                args: [suckerInfo.address as Address, approvalAmount]
            })
        } catch (err) {
            console.error('Failed to approve token:', err)
            setError('Failed to approve token spending')
            setApprovalStep('needed')
        }
    }

    const handleBridge = async () => {
        if (!selectedPair || !terminalToken || !amount || !address || approvalStep !== 'confirmed') return

        try {
            setLoading(true)
            setError(null)

            const suckerInfo = selectedPair.chainA.chainId === chainId ? selectedPair.chainA : selectedPair.chainB
            
            const transactionId = `bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            setBridgeTransactionId(transactionId)

            const contractData = suckerService.getPrepareFunctionData({
                projectTokenCount: amount,
                beneficiary: address,
                minTokensReclaimed: '0',
                token: terminalToken
            }, tokenDecimals)

            writeContract({
                address: suckerInfo.address as Address,
                abi: contractData.abi,
                functionName: contractData.functionName,
                args: contractData.args
            })
        } catch (err) {
            console.error('Failed to initiate bridge:', err)
            setError('Failed to initiate bridge transaction')
            setLoading(false)
        }
    }

    const getDestinationChain = (pair: SuckerPair) => {
        return pair.chainA.chainId === chainId ? pair.chainB : pair.chainA
    }

    const formatBalance = (balance: bigint, decimals: number) => {
        const formatted = formatUnits(balance, decimals)
        const num = parseFloat(formatted)
        return num.toLocaleString(undefined, { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 4 
        })
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bridge Tokens</h2>
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center mb-6">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    step === 'token' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                }`}>
                    {step === 'token' ? '1' : <CheckCircle className="w-4 h-4" />}
                </div>
                <div className={`w-12 h-0.5 ${step === 'token' ? 'bg-gray-300' : 'bg-green-600'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    step === 'token' ? 'bg-gray-300 text-gray-600' : 
                    step === 'pairs' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                }`}>
                    {step === 'amount' ? <CheckCircle className="w-4 h-4" /> : '2'}
                </div>
                <div className={`w-12 h-0.5 ${step === 'amount' ? 'bg-green-600' : 'bg-gray-300'}`} />
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    step === 'amount' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                    3
                </div>
            </div>

            {/* Error Display - Fixed position to prevent layout shift */}
            <div className="h-12 mb-4">
                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}
            </div>

            {/* Step 1: Token Input */}
            {step === 'token' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Project Token Address
                        </label>
                        <div className="space-y-3">
                            <input
                                type="text"
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                                value={tokenAddress}
                                onChange={(e) => setTokenAddress(e.target.value)}
                                placeholder="0x..."
                                disabled={loading}
                            />
                            <button
                                onClick={handleTokenLookup}
                                disabled={loading || !tokenAddress || !isConnected}
                                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader className="w-4 h-4 animate-spin" />
                                        Detecting bridge types...
                                    </>
                                ) : (
                                    'Find Bridge Options'
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Enter your Juicebox project token address to discover available bridges
                        </p>
                    </div>
                </div>
            )}

            {/* Step 2: Bridge Options */}
            {step === 'pairs' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Choose Destination</h3>
                        <button
                            onClick={() => setStep('token')}
                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                            ← Back
                        </button>
                    </div>
                    
                    <div className="space-y-3">
                        {suckerPairs.map((pair) => {
                            const destination = getDestinationChain(pair)
                            const destinationName = getChainName(destination.chainId)
                            
                            // Get bridge info for the source chain sucker
                            const sourceChain = pair.chainA.chainId === chainId ? pair.chainA : pair.chainB
                            const bridgeInfo = sourceChain.bridgeInfo
                            const isCCIP = bridgeInfo?.bridgeInfo.type === 'CCIP'
                            const bridgeDisplayName = bridgeInfo?.bridgeInfo.displayName || 'Unknown Bridge'
                            
                            return (
                                <button
                                    key={pair.id}
                                    onClick={() => handlePairSelection(pair)}
                                    disabled={loading || !isCCIP}
                                    className={`w-full p-4 border rounded-lg transition-colors text-left ${
                                        isCCIP 
                                            ? 'border-gray-200 dark:border-gray-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20' 
                                            : 'border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-800 opacity-60 cursor-not-allowed'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <ChainLogo 
                                                chainId={chainId} 
                                                chainName={getChainName(chainId)} 
                                                size="sm" 
                                            />
                                            <ArrowRight className="w-4 h-4 text-gray-400" />
                                            <ChainLogo 
                                                chainId={destination.chainId} 
                                                chainName={destinationName} 
                                                size="sm" 
                                            />
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    Bridge to {destinationName}
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {bridgeDisplayName}
                                                    {!isCCIP && ' (Not supported)'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!isCCIP && (
                                                <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    Disabled
                                                </span>
                                            )}
                                            <ArrowRight className="w-4 h-4 text-gray-400" />
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Step 3: Amount & Bridge */}
            {step === 'amount' && selectedPair && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Bridge Amount</h3>
                        <button
                            onClick={() => setStep('pairs')}
                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                            ← Back
                        </button>
                    </div>

                    {/* Destination Display */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex items-center justify-center gap-3">
                            <ChainLogo chainId={chainId} chainName={getChainName(chainId)} size="sm" />
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                            <ChainLogo 
                                chainId={getDestinationChain(selectedPair).chainId} 
                                chainName={getChainName(getDestinationChain(selectedPair).chainId)} 
                                size="sm" 
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                to {getChainName(getDestinationChain(selectedPair).chainId)}
                            </span>
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Amount
                            </label>
                            {balanceLoaded && (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    Balance: {formatBalance(tokenBalance, tokenDecimals)}
                                    <button
                                        onClick={handleMaxAmount}
                                        className="ml-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                                    >
                                        MAX
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.0"
                            disabled={loading || !balanceLoaded}
                        />
                    </div>

                    {/* Approval Section */}
                    {approvalStep === 'needed' && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                    Approval Required
                                </span>
                            </div>
                            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                                You need to approve the bridge contract to spend your tokens.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleApproval(false)}
                                    disabled={isWriting}
                                    className="flex-1 py-2 px-3 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 text-sm"
                                >
                                    {isWriting ? 'Approving...' : `Approve ${amount}`}
                                </button>
                                <button
                                    onClick={() => handleApproval(true)}
                                    disabled={isWriting}
                                    className="flex-1 py-2 px-3 bg-yellow-700 text-white rounded-md hover:bg-yellow-800 disabled:opacity-50 text-sm"
                                >
                                    {isWriting ? 'Approving...' : 'Approve Unlimited'}
                                </button>
                            </div>
                        </div>
                    )}

                    {approvalStep === 'pending' && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Loader className="w-4 h-4 animate-spin text-blue-600" />
                                <span className="text-sm text-blue-800 dark:text-blue-200">
                                    Approval transaction pending...
                                </span>
                            </div>
                        </div>
                    )}

                    {approvalStep === 'confirmed' && (
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-green-800 dark:text-green-200">
                                    Approval confirmed! Ready to bridge.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Bridge Button */}
                    <button
                        onClick={handleBridge}
                        disabled={loading || approvalStep !== 'confirmed' || !amount || isWriting || isConfirming || waitingForEvent}
                        className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                        {loading || isWriting || isConfirming || waitingForEvent ? (
                            <>
                                <Loader className="w-4 h-4 animate-spin" />
                                {waitingForEvent ? 'Confirming...' : isConfirming ? 'Processing...' : 'Initiating Bridge...'}
                            </>
                        ) : approvalStep === 'needed' ? (
                            <>
                                <AlertCircle className="w-4 h-4" />
                                Approve Tokens First
                            </>
                        ) : (
                            <>
                                <ArrowRight className="w-4 h-4" />
                                Initiate Bridge
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}