'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { BridgeTransactionList } from './BridgeTransactionList'
import { NewBridgeForm } from './NewBridgeForm'
import { ConnectButton } from './ConnectButton'
import { PlusIcon } from './Icons'
import { bridgeStateService } from '@/services/bridgeStateService'
import { bridgeStorageService } from '@/services/bridgeStorageService'

export function BridgeUI() {
    const { isConnected } = useAccount()
    const [showNewBridgeForm, setShowNewBridgeForm] = useState(false)

    // Add debug functions to global window for testing
    useEffect(() => {
        // @ts-expect-error - Adding debug functions to window for development
        window.debugBridge = {
            forceBackendCheck: () => bridgeStateService.forceBackendCheck(),
            getAllTransactions: () => bridgeStorageService.getAllTransactions(),
            createTestTransaction: () => {
                // Create a test transaction in sent_to_remote status for testing
                const testTx = {
                    id: bridgeStorageService.generateTransactionId(),
                    transactionHash: '0x1234567890abcdef',
                    projectId: '1',
                    sourceChainId: 1,
                    targetChainId: 10,
                    suckerAddress: '0x0000000000000000000000000000000000000001' as `0x${string}`,
                    beneficiary: '0x0000000000000000000000000000000000000002' as `0x${string}`,
                    token: '0x0000000000000000000000000000000000000003' as `0x${string}`,
                    projectTokenCount: '1000000000000000000',
                    terminalTokenAmount: '1000000000000000000',
                    minTokensReclaimed: '0',
                    hashed: '0xhash',
                    index: '0',
                    root: '0xroot',
                    caller: '0x0000000000000000000000000000000000000004' as `0x${string}`,
                    claimProof: null,
                    claimLeaf: null,
                    timestamp: Date.now(),
                    status: 'sent_to_remote' as const
                }
                bridgeStorageService.storeBridgeTransaction(testTx)
                console.log('Created test transaction:', testTx)
                return testTx
            }
        }
        console.log('Debug functions available: window.debugBridge.forceBackendCheck(), window.debugBridge.getAllTransactions(), window.debugBridge.createTestTransaction()')
    }, [])

    const handleNewBridgeSuccess = () => {
        setShowNewBridgeForm(false)
        // In a real app, you would refresh the transaction list here
        // For now, we'll just close the form
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold mb-2">Token Bridge</h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Bridge your Juicebox tokens across chains
                    </p>
                </div>

                <div className="mt-4 md:mt-0">
                    {!isConnected ? (
                        <ConnectButton />
                    ) : (
                        <button
                            onClick={() => setShowNewBridgeForm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            disabled={showNewBridgeForm}
                        >
                            <PlusIcon className="w-5 h-5" />
                            New Bridge
                        </button>
                    )}
                </div>
            </div>

            {showNewBridgeForm && (
                <div className="mb-8">
                    <NewBridgeForm
                        onSuccess={handleNewBridgeSuccess}
                        onCancel={() => setShowNewBridgeForm(false)}
                    />
                </div>
            )}

            <div>
                <h2 className="text-xl font-bold mb-4">Your Bridge Transactions</h2>
                <BridgeTransactionList />
            </div>
        </div>
    )
}
