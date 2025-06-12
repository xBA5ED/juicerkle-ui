import { type Address } from 'viem'
import { type TransactionStatus, type JBLeaf, type JBClaim, type SuckerBridgeInfo } from '@/types/bridge'

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
  
  // Bridge implementation info (optional, for enhanced UX)
  bridgeInfo?: SuckerBridgeInfo
  
  // Event data from InsertToOutboxTree
  hashed: string
  index: string
  root: string
  caller: Address
  
  // Claim data from backend (populated when ready_to_claim)
  claimProof: string[] | null
  claimLeaf: JBLeaf | null
  
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
      // Dispatch custom event to notify components in the same tab
      window.dispatchEvent(new CustomEvent('bridge-transactions-updated'))
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

  // Get transactions waiting to be sent for a specific sucker and token
  getTransactionsWaitingToSend(suckerAddress: Address, tokenAddress: Address): StoredBridgeTransaction[] {
    return this.getStoredTransactions().filter(
      tx => tx.status === 'waiting_to_send' && 
            tx.suckerAddress.toLowerCase() === suckerAddress.toLowerCase() &&
            tx.token.toLowerCase() === tokenAddress.toLowerCase()
    )
  }

  // Get all transactions that are waiting to be sent, grouped by sucker and token
  getGroupedTransactionsWaitingToSend(): Map<string, StoredBridgeTransaction[]> {
    const transactions = this.getStoredTransactions().filter(tx => tx.status === 'waiting_to_send')
    const grouped = new Map<string, StoredBridgeTransaction[]>()

    transactions.forEach(tx => {
      const key = `${tx.suckerAddress.toLowerCase()}-${tx.token.toLowerCase()}`
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(tx)
    })

    return grouped
  }

  // Get transactions that have been sent to remote and need claim data
  getTransactionsNeedingClaimData(): StoredBridgeTransaction[] {
    return this.getStoredTransactions().filter(
      tx => tx.status === 'sent_to_remote' && (tx.claimProof === null || tx.claimProof === undefined)
    )
  }

  // Get transactions for backend API call, grouped by destination chain/sucker/token/beneficiary
  getTransactionsForClaimsRequest(): Map<string, { transactions: StoredBridgeTransaction[], request: { chainId: number, sucker: Address, token: Address, beneficiary: Address } }> {
    const transactions = this.getTransactionsNeedingClaimData()
    console.log('Transactions needing claim data:', transactions.map(tx => ({
      id: tx.id,
      status: tx.status,
      claimProof: tx.claimProof,
      targetChainId: tx.targetChainId,
      suckerAddress: tx.suckerAddress,
      token: tx.token,
      beneficiary: tx.beneficiary
    })))
    
    const grouped = new Map<string, { transactions: StoredBridgeTransaction[], request: { chainId: number, sucker: Address, token: Address, beneficiary: Address } }>()

    transactions.forEach(tx => {
      // Group by destination chain, destination sucker, terminal token, and beneficiary
      const key = `${tx.targetChainId}-${tx.suckerAddress.toLowerCase()}-${tx.token.toLowerCase()}-${tx.beneficiary.toLowerCase()}`
      console.log(`Grouping transaction ${tx.id} with key: ${key}`)
      if (!grouped.has(key)) {
        grouped.set(key, {
          transactions: [],
          request: {
            chainId: tx.targetChainId,
            sucker: tx.suckerAddress,
            token: tx.token,
            beneficiary: tx.beneficiary
          }
        })
      }
      grouped.get(key)!.transactions.push(tx)
    })

    console.log(`Created ${grouped.size} groups for backend requests`)
    return grouped
  }

  // Update transaction with claim data from backend
  updateTransactionWithClaimData(transactionId: string, claimData: JBClaim): void {
    const transactions = this.getStoredTransactions()
    const transaction = transactions.find(tx => tx.id === transactionId)
    
    if (!transaction) {
      console.warn(`Transaction ${transactionId} not found when updating with claim data`)
      return
    }

    transaction.claimProof = claimData.Proof
    transaction.claimLeaf = claimData.Leaf
    transaction.status = 'ready_to_claim'
    
    this.saveTransactions(transactions)
    console.log(`Updated transaction ${transactionId} with claim data and set status to ready_to_claim`)
  }

  // Get transactions ready to claim (have proof data)
  getTransactionsReadyToClaim(): StoredBridgeTransaction[] {
    return this.getStoredTransactions().filter(
      tx => tx.status === 'ready_to_claim' && tx.claimProof !== null && tx.claimLeaf !== null
    )
  }

  // Create a new transaction from backend claim data (for unknown claims)
  createTransactionFromClaimData(
    claimData: JBClaim,
    chainId: number,
    suckerAddress: Address,
    projectId: string
  ): StoredBridgeTransaction {
    const transaction: StoredBridgeTransaction = {
      id: this.generateTransactionId(),
      transactionHash: '', // Unknown - this came from backend
      projectId,
      sourceChainId: 0, // Unknown
      targetChainId: chainId,
      suckerAddress,
      beneficiary: claimData.Leaf.Beneficiary as Address,
      token: claimData.Token as Address,
      projectTokenCount: claimData.Leaf.ProjectTokenCount,
      terminalTokenAmount: claimData.Leaf.TerminalTokenAmount,
      minTokensReclaimed: '0', // Unknown
      hashed: '', // Unknown
      index: claimData.Leaf.Index,
      root: '', // Unknown
      caller: '0x0000000000000000000000000000000000000000',
      claimProof: claimData.Proof,
      claimLeaf: claimData.Leaf,
      timestamp: Date.now(),
      status: 'ready_to_claim'
    }

    const transactions = this.getStoredTransactions()
    transactions.push(transaction)
    this.saveTransactions(transactions)
    
    console.log(`Created new transaction ${transaction.id} from backend claim data`)
    return transaction
  }
}

export const bridgeStorageService = new BridgeStorageService()