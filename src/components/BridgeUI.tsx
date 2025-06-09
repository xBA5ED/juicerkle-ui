'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { BridgeTransactionList } from './BridgeTransactionList'
import { NewBridgeForm } from './NewBridgeForm'
import { ConnectButton } from './ConnectButton'
import { PendingBridgeActions } from './PendingBridgeActions'
import { PlusIcon } from './Icons'
import { suckerDiscoveryService } from '@/services/suckerDiscoveryService'

export function BridgeUI() {
    const { isConnected } = useAccount()
    const [showNewBridgeForm, setShowNewBridgeForm] = useState(false)

    // Test sucker discovery on component mount
    // useEffect(() => {
    //   const testSuckerDiscovery = async () => {
    //     try {
    //       console.log('🔍 Testing sucker discovery...')
    //       
    //       // Test with a sample project ID on Ethereum mainnet
    //       // You can change these values to test with real project IDs
    //       const testChainId = 1 // Ethereum mainnet
    //       const testProjectId = '1' // Sample project ID
    //       
    //       console.log(`Discovering suckers for project ${testProjectId} on chain ${testChainId}`)
    //       
    //       const result = await suckerDiscoveryService.discoverAllSuckers(testChainId, testProjectId)
    //       
    //       console.log('🎉 Sucker discovery result:', {
    //         projectMappings: Array.from(result.projectMappings.entries()),
    //         suckerPairs: Array.from(result.suckerPairs.entries()),
    //         totalProjects: result.projectMappings.size,
    //         totalSuckerPairs: result.suckerPairs.size
    //       })
    //       
    //       // Log each sucker pair in a readable format
    //       result.suckerPairs.forEach((pair, pairId) => {
    //         console.log(`🔗 Sucker Pair ${pairId}:`, {
    //           chainA: `${pair.chainA.chainId} (Project ${pair.chainA.projectId}) → ${pair.chainA.address}`,
    //           chainB: `${pair.chainB.chainId} (Project ${pair.chainB.projectId}) → ${pair.chainB.address}`
    //         })
    //       })
    //     } catch (error) {
    //       console.error('❌ Sucker discovery failed:', error)
    //     }
    //   }
    //   
    //   testSuckerDiscovery()
    // }, [])

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
                        Bridge your tokens across different chains
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

            {isConnected && (
                <div className="mb-8">
                    <PendingBridgeActions />
                </div>
            )}

            <div>
                <h2 className="text-xl font-bold mb-4">Your Bridge Transactions</h2>
                <BridgeTransactionList />
            </div>
        </div>
    )
}
