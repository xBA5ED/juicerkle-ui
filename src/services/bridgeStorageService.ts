import { type Address } from 'viem'

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
  status: 'pending' | 'confirmed' | 'bridged' | 'claimed'
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

  updateTransactionStatus(id: string, status: StoredBridgeTransaction['status']): void {
    const transactions = this.getStoredTransactions()
    const transaction = transactions.find(tx => tx.id === id)
    if (transaction) {
      transaction.status = status
      this.saveTransactions(transactions)
    }
  }

  updateTransactionWithEventData(
    transactionHash: string, 
    eventData: {
      hashed: string
      index: string
      root: string
      terminalTokenAmount: string
      caller: Address
    }
  ): void {
    const transactions = this.getStoredTransactions()
    const transaction = transactions.find(tx => tx.transactionHash === transactionHash)
    if (transaction) {
      transaction.hashed = eventData.hashed
      transaction.index = eventData.index
      transaction.root = eventData.root
      transaction.terminalTokenAmount = eventData.terminalTokenAmount
      transaction.caller = eventData.caller
      transaction.status = 'confirmed'
      this.saveTransactions(transactions)
    }
  }

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
}

export const bridgeStorageService = new BridgeStorageService()