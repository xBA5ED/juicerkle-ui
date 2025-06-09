import { type Address } from 'viem'
import { suckerService } from './suckerService'
import { bridgeStorageService, type StoredBridgeTransaction } from './bridgeStorageService'
import { type TransactionStatus } from '@/types/bridge'

export interface BridgeStateInfo {
  transactionId: string
  currentStatus: TransactionStatus
  previousStatus: TransactionStatus
  statusChanged: boolean
  outboxIndex?: number
  numberOfClaimsSent?: number
}

class BridgeStateService {
  // Cache for outbox trees to avoid duplicate RPC calls
  private outboxCache = new Map<string, { data: any, timestamp: number }>()
  private readonly CACHE_TTL = 30000 // 30 seconds

  /**
   * Get outbox tree with caching to reduce RPC calls
   */
  private async getCachedOutboxTree(chainId: number, suckerAddress: Address, token: Address) {
    const cacheKey = `${chainId}-${suckerAddress}-${token}`
    const cached = this.outboxCache.get(cacheKey)
    
    // Return cached data if it's still fresh
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log(`Using cached outbox data for ${cacheKey}`)
      return cached.data
    }
    
    // Fetch fresh data
    console.log(`Fetching fresh outbox data for ${cacheKey}`)
    const outboxTree = await suckerService.getOutboxTree(chainId, suckerAddress, token)
    
    // Cache the result
    this.outboxCache.set(cacheKey, {
      data: outboxTree,
      timestamp: Date.now()
    })
    
    return outboxTree
  }

  /**
   * Check the current state of a bridge transaction by comparing its index 
   * with the numberOfClaimsSent from the outbox tree
   */
  async checkTransactionState(transaction: StoredBridgeTransaction): Promise<BridgeStateInfo> {
    const previousStatus = transaction.status
    let currentStatus = previousStatus
    let outboxIndex: number | undefined
    let numberOfClaimsSent: number | undefined

    try {
      // Only check outbox state for transactions that have been confirmed (have an index)
      if ((transaction.status === 'confirmed' || transaction.status === 'waiting_to_send') && transaction.index) {
        outboxIndex = parseInt(transaction.index)
        
        // Get the outbox tree from the source sucker (cached)
        const outboxTree = await this.getCachedOutboxTree(
          transaction.sourceChainId,
          transaction.suckerAddress,
          transaction.token
        )
        
        numberOfClaimsSent = outboxTree.numberOfClaimsSent
        
        // Determine new status based on index vs numberOfClaimsSent
        if (outboxIndex < numberOfClaimsSent) {
          // Our transaction has been sent to the remote chain
          currentStatus = 'sent_to_remote'
        }
        // Note: we could add 'ready_to_claim' state here when we integrate with juicemerkle backend
      }
      
      // Update status in storage if it changed
      if (currentStatus !== previousStatus) {
        bridgeStorageService.updateTransactionStatus(transaction.id, currentStatus)
      }
      
      return {
        transactionId: transaction.id,
        currentStatus,
        previousStatus,
        statusChanged: currentStatus !== previousStatus,
        outboxIndex,
        numberOfClaimsSent
      }
      
    } catch (error) {
      console.error(`Failed to check state for transaction ${transaction.id}:`, error)
      
      // Return current state without changes if we can't check
      return {
        transactionId: transaction.id,
        currentStatus: previousStatus,
        previousStatus,
        statusChanged: false,
        outboxIndex,
        numberOfClaimsSent
      }
    }
  }

  /**
   * Check states for all confirmed transactions (optimized with batching)
   */
  async checkAllTransactionStates(): Promise<BridgeStateInfo[]> {
    const allTransactions = bridgeStorageService.getAllTransactions()
    
    // Filter to only confirmed transactions (have index) and not yet claimed
    const confirmedTransactions = allTransactions.filter(
      tx => tx.status === 'confirmed' || tx.status === 'waiting_to_send' || tx.status === 'sent_to_remote'
    )
    
    // If no transactions need checking, return empty array
    if (confirmedTransactions.length === 0) {
      return []
    }
    
    return this.checkTransactionStatesBatch(confirmedTransactions)
  }

  /**
   * Check state for transactions on a specific chain (optimized with batching)
   */
  async checkTransactionStatesForChain(chainId: number): Promise<BridgeStateInfo[]> {
    const chainTransactions = bridgeStorageService.getTransactionsByChain(chainId)
    
    const confirmedTransactions = chainTransactions.filter(
      tx => (tx.status === 'confirmed' || tx.status === 'waiting_to_send' || tx.status === 'sent_to_remote') && 
           tx.sourceChainId === chainId // Only check outbox on source chain
    )
    
    // If no transactions need checking, return empty array
    if (confirmedTransactions.length === 0) {
      return []
    }
    
    return this.checkTransactionStatesBatch(confirmedTransactions)
  }

  /**
   * Optimized batch checking that groups transactions by sucker/token to minimize RPC calls
   */
  private async checkTransactionStatesBatch(transactions: StoredBridgeTransaction[]): Promise<BridgeStateInfo[]> {
    // Group transactions by sucker contract + token combination
    const groupedTx = new Map<string, StoredBridgeTransaction[]>()
    
    transactions.forEach(tx => {
      if (tx.status === 'confirmed' || tx.status === 'waiting_to_send' || tx.status === 'sent_to_remote') {
        const key = `${tx.sourceChainId}-${tx.suckerAddress}-${tx.token}`
        if (!groupedTx.has(key)) {
          groupedTx.set(key, [])
        }
        groupedTx.get(key)!.push(tx)
      }
    })
    
    console.log(`Checking ${transactions.length} transactions in ${groupedTx.size} groups (reduced from ${transactions.length} to ${groupedTx.size} RPC calls)`)
    
    const results: BridgeStateInfo[] = []
    
    // Process each group - this will make one RPC call per sucker/token combination
    for (const [key, groupTransactions] of groupedTx) {
      try {
        const firstTx = groupTransactions[0]
        
        // Make one outbox call for the entire group
        const outboxTree = await this.getCachedOutboxTree(
          firstTx.sourceChainId,
          firstTx.suckerAddress,
          firstTx.token
        )
        
        // Process all transactions in this group with the same outbox data
        for (const tx of groupTransactions) {
          const previousStatus = tx.status
          let currentStatus = previousStatus
          let outboxIndex: number | undefined
          let numberOfClaimsSent: number | undefined
          
          try {
            if (tx.index) {
              outboxIndex = parseInt(tx.index)
              numberOfClaimsSent = outboxTree.numberOfClaimsSent
              
              // Determine new status based on index vs numberOfClaimsSent
              if (outboxIndex < numberOfClaimsSent) {
                currentStatus = 'sent_to_remote'
              }
            }
            
            // Update status in storage if it changed
            if (currentStatus !== previousStatus) {
              bridgeStorageService.updateTransactionStatus(tx.id, currentStatus)
            }
            
            results.push({
              transactionId: tx.id,
              currentStatus,
              previousStatus,
              statusChanged: currentStatus !== previousStatus,
              outboxIndex,
              numberOfClaimsSent
            })
            
          } catch (txError) {
            console.error(`Failed to process transaction ${tx.id}:`, txError)
            
            results.push({
              transactionId: tx.id,
              currentStatus: previousStatus,
              previousStatus,
              statusChanged: false,
              outboxIndex,
              numberOfClaimsSent
            })
          }
        }
        
      } catch (groupError) {
        console.error(`Failed to check outbox for group ${key}:`, groupError)
        
        // Add failed results for all transactions in this group
        groupTransactions.forEach(tx => {
          results.push({
            transactionId: tx.id,
            currentStatus: tx.status,
            previousStatus: tx.status,
            statusChanged: false
          })
        })
      }
    }
    
    return results
  }

  /**
   * Get human-readable status description
   */
  getStatusDescription(status: TransactionStatus): string {
    switch (status) {
      case 'pending':
        return 'Transaction pending confirmation'
      case 'confirmed':
        return 'Transaction confirmed'
      case 'waiting_to_send':
        return 'Added to outbox tree, waiting to be sent'
      case 'sent_to_remote':
        return 'Sent to destination chain'
      case 'ready_to_claim':
        return 'Ready to claim on destination chain'
      case 'claimed':
        return 'Successfully claimed'
      default:
        return 'Unknown status'
    }
  }

  /**
   * Get status progress (0-100)
   */
  getStatusProgress(status: TransactionStatus): number {
    switch (status) {
      case 'pending':
        return 20
      case 'confirmed':
        return 30
      case 'waiting_to_send':
        return 40
      case 'sent_to_remote':
        return 60
      case 'ready_to_claim':
        return 80
      case 'claimed':
        return 100
      default:
        return 0
    }
  }
}

export const bridgeStateService = new BridgeStateService()