'use client'

import { useEffect, useState } from 'react'
import { BridgeTransaction } from '@/types/bridge'
import { BridgeTransactionCard } from './BridgeTransactionCard'
import { getBridgeTransactions } from '@/services/mockBridgeService'

export function BridgeTransactionList() {
  const [transactions, setTransactions] = useState<BridgeTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true)
        const data = await getBridgeTransactions()
        setTransactions(data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch transactions:', err)
        setError('Failed to load transactions. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    
    fetchTransactions()
  }, [])
  
  const handleClaim = (transaction: BridgeTransaction) => {
    console.log('Claiming transaction:', transaction)
    // In a real app, you would call your backend API to claim the transaction
    // For this mock implementation, we'll just update the local state
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === transaction.id 
          ? { ...tx, status: 'claimed' as const } 
          : tx
      )
    )
  }
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>{error}</p>
        <button 
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    )
  }
  
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No bridge transactions found.</p>
      </div>
    )
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {transactions.map(transaction => (
        <BridgeTransactionCard 
          key={transaction.id} 
          transaction={transaction} 
          onClaim={transaction.status === 'awaiting_claim' ? handleClaim : undefined}
        />
      ))}
    </div>
  )
}