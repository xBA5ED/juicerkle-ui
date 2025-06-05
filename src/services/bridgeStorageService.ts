import { type Address } from 'viem'
import { type TransactionStatus } from '@/types/bridge'

export interface StoredBridgeTransaction {
  // Transaction identifiers
  id: string // Unique identifier for this bridge transaction
  transactionHash: string
  
  // Project and chain info
  projectId: string
  sourceChainId: number
  targetChainId: number
  suckerAddress: Address
  
  // Bridge details
  beneficiary: Address
  token: Address // Terminal token
  projectTokenCount: string
  terminalTokenAmount: string
  minTokensReclaimed: string
  
  // Event data from InsertToOutboxTree
  hashed: string
  index: string
  root: string
  caller: Address
  
  // Metadata
  timestamp: number
  status: TransactionStatus
}

const STORAGE_KEY = 'juicerkle-bridge-transactions'

class BridgeStorageService {
  private getStoredTransactions(): StoredBridgeTransaction[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to load stored bridge transactions:', error)
      return []
    }
  }

  private saveTransactions(transactions: StoredBridgeTransaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
    } catch (error) {
      console.error('Failed to save bridge transactions:', error)
    }
  }

  storeBridgeTransaction(transaction: StoredBridgeTransaction): void {
    const transactions = this.getStoredTransactions()
    transactions.push(transaction)
    this.saveTransactions(transactions)
  }

  updateTransactionStatus(id: string, status: TransactionStatus): void {
    const transactions = this.getStoredTransactions()
    const transaction = transactions.find(tx => tx.id === id)
    if (transaction) {
      transaction.status = status
      this.saveTransactions(transactions)
    }
  }

  // Note: updateTransactionWithEventData removed - we now store complete transactions only when confirmed

  getAllTransactions(): StoredBridgeTransaction[] {
    return this.getStoredTransactions()
  }

  getTransactionsByChain(chainId: number): StoredBridgeTransaction[] {
    return this.getStoredTransactions().filter(
      tx => tx.sourceChainId === chainId || tx.targetChainId === chainId
    )
  }

  getTransactionById(id: string): StoredBridgeTransaction | null {
    const transactions = this.getStoredTransactions()
    return transactions.find(tx => tx.id === id) || null
  }

  getTransactionByHash(hash: string): StoredBridgeTransaction | null {
    const transactions = this.getStoredTransactions()
    return transactions.find(tx => tx.transactionHash === hash) || null
  }

  clearAllTransactions(): void {
    localStorage.removeItem(STORAGE_KEY)
  }

  generateTransactionId(): string {
    return `bridge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Debug method to check for and remove duplicates
  removeDuplicateTransactions(): void {
    const transactions = this.getStoredTransactions()
    const uniqueById = new Map<string, StoredBridgeTransaction>()
    const uniqueByHash = new Map<string, StoredBridgeTransaction>()
    
    // First, deduplicate by ID (should be primary)
    transactions.forEach(tx => {
      const existing = uniqueById.get(tx.id)
      if (!existing || tx.timestamp > existing.timestamp) {
        uniqueById.set(tx.id, tx)
      }
    })
    
    // Then, deduplicate by transaction hash (in case IDs differ)
    Array.from(uniqueById.values()).forEach(tx => {
      const existing = uniqueByHash.get(tx.transactionHash)
      if (!existing || tx.timestamp > existing.timestamp) {
        uniqueByHash.set(tx.transactionHash, tx)
      }
    })
    
    const deduplicatedTransactions = Array.from(uniqueByHash.values())
    
    if (deduplicatedTransactions.length !== transactions.length) {
      console.log(`Removed ${transactions.length - deduplicatedTransactions.length} duplicate transactions`)
      console.log('Duplicates found:', {
        original: transactions.length,
        afterIdDedup: uniqueById.size,
        afterHashDedup: deduplicatedTransactions.length
      })
      this.saveTransactions(deduplicatedTransactions)
    }
  }

  // Debug method to show all transaction IDs
  debugTransactions(): void {
    const transactions = this.getStoredTransactions()
    console.log('All transactions:', transactions.map(tx => ({
      id: tx.id,
      status: tx.status,
      timestamp: new Date(tx.timestamp).toISOString(),
      hash: tx.transactionHash.slice(0, 10)
    })))
  }
}

export const bridgeStorageService = new BridgeStorageService()