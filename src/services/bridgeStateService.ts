import { type Address } from 'viem'
import { suckerService } from './suckerService'
import { bridgeStorageService, type StoredBridgeTransaction } from './bridgeStorageService'
import { juicemerkleApiService } from './juicemerkleApiService'
import { jbTokensService } from './jbTokensService'
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
  
  // Track last backend check time to implement 60-second interval
  private lastBackendCheck = 0
  private readonly BACKEND_CHECK_INTERVAL = 60000 // 60 seconds

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
   * Check backend for claim data for sent_to_remote transactions
   */
  private async checkBackendForClaimData(): Promise<void> {
    const now = Date.now()
    
    // Debug logging to see what transactions we have
    const allTransactions = bridgeStorageService.getAllTransactions()
    const sentToRemoteTransactions = allTransactions.filter(tx => tx.status === 'sent_to_remote')
    const needingClaimData = bridgeStorageService.getTransactionsNeedingClaimData()
    
    console.log('Backend check debug:', {
      totalTransactions: allTransactions.length,
      sentToRemoteCount: sentToRemoteTransactions.length,
      needingClaimDataCount: needingClaimData.length,
      lastBackendCheck: this.lastBackendCheck,
      timeSinceLastCheck: now - this.lastBackendCheck,
      intervalRequired: this.BACKEND_CHECK_INTERVAL
    })
    
    // Only check backend every 60 seconds
    if (now - this.lastBackendCheck < this.BACKEND_CHECK_INTERVAL) {
      console.log(`Skipping backend check - only ${now - this.lastBackendCheck}ms since last check (need ${this.BACKEND_CHECK_INTERVAL}ms)`)
      return
    }
    
    this.lastBackendCheck = now
    
    try {
      const claimRequests = bridgeStorageService.getTransactionsForClaimsRequest()
      
      if (claimRequests.size === 0) {
        console.log('No transactions need claim data from backend (after grouping)')
        return
      }
      
      console.log(`Checking backend for claim data for ${claimRequests.size} request groups`)
      
      // Process each group of transactions
      for (const [key, { transactions, request }] of claimRequests) {
        try {
          console.log(`Checking backend for claims: chain ${request.chainId}, sucker ${request.sucker}, token ${request.token}, beneficiary ${request.beneficiary}`)
          
          const claims = await juicemerkleApiService.getClaimsForBeneficiary(
            request.chainId,
            request.sucker,
            request.token,
            request.beneficiary
          )
          
          console.log(`Backend returned ${claims.length} claims for group ${key}`)
          
          // Match claims to our stored transactions
          const matchedTransactionIds = new Set<string>()
          
          for (const claim of claims) {
            // Try to match this claim to one of our transactions by leaf data
            let matchedTransaction: StoredBridgeTransaction | null = null
            
            for (const tx of transactions) {
              // Match by index, beneficiary, and amounts
              if (
                claim.Leaf.Index.toString() === tx.index 
              ) {
                matchedTransaction = tx
                break
              }
            }
            
            if (matchedTransaction) {
              // Update our stored transaction with claim data
              bridgeStorageService.updateTransactionWithClaimData(matchedTransaction.id, claim)
              matchedTransactionIds.add(matchedTransaction.id)
              console.log(`Matched claim to transaction ${matchedTransaction.id}`)
            } else {
              // This is a claim we don't know about - create a new transaction
              console.log('Found unknown claim from backend:', {
                index: claim.Leaf.Index,
                beneficiary: claim.Leaf.Beneficiary,
                projectTokenCount: claim.Leaf.ProjectTokenCount,
                terminalTokenAmount: claim.Leaf.TerminalTokenAmount,
                token: claim.Token
              })
              
              // Try to get project ID for this token
              try {
                const projectId = await jbTokensService.getProjectIdForToken(request.chainId, claim.Token as Address)
                if (projectId) {
                  const newTransaction = bridgeStorageService.createTransactionFromClaimData(
                    claim,
                    request.chainId,
                    request.sucker,
                    projectId
                  )
                  console.log(`Created new transaction ${newTransaction.id} from unknown backend claim`)
                } else {
                  console.log(`Skipping unknown claim - could not find project ID for token ${claim.Token}`)
                }
              } catch (error) {
                console.error(`Failed to get project ID for unknown claim token ${claim.Token}:`, error)
              }
            }
          }
          
          // Log any transactions that didn't get matched
          const unmatchedTransactions = transactions.filter(tx => !matchedTransactionIds.has(tx.id))
          if (unmatchedTransactions.length > 0) {
            console.log(`${unmatchedTransactions.length} transactions in group ${key} did not get claim data from backend`)
          }
          
        } catch (error) {
          console.error(`Failed to check backend for group ${key}:`, error)
        }
      }
      
    } catch (error) {
      console.error('Failed to check backend for claim data:', error)
    }
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
    // Check backend for claim data first (rate limited to 60 seconds)
    await this.checkBackendForClaimData()
    
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
    // Check backend for claim data first (rate limited to 60 seconds)
    await this.checkBackendForClaimData()
    
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

  /**
   * Manual method to force backend check (for debugging)
   */
  async forceBackendCheck(): Promise<void> {
    console.log('Forcing backend check...')
    this.lastBackendCheck = 0 // Reset to force check
    await this.checkBackendForClaimData()
  }
}

export const bridgeStateService = new BridgeStateService()
