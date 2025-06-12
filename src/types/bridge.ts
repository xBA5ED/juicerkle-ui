export type BridgeStatus = 'awaiting_bridge' | 'in_transit' | 'awaiting_claim' | 'claimed'

// New transaction states for outbox tracking
export type TransactionStatus = 'initiated' | 'waiting_to_send' | 'sent_to_remote' | 'ready_to_claim' | 'claimed'

// Outbox tree structures
export interface Tree {
  branch: string[] // bytes32[32] array
  count: number
}

export interface JBOutboxTree {
  nonce: number
  balance: string // uint256 as string
  tree: Tree
  numberOfClaimsSent: number
}

export interface Token {
  symbol: string
  name: string
  address: string
  decimals: number
  projectId: string
  logoUrl?: string
}

export interface BridgeTransaction {
  id: string
  sourceChainId: number
  destinationChainId: number
  token: Token
  amount: string
  status: BridgeStatus
}

export interface JBSuckersPair {
  local: string
  remote: string
  remoteChainId: number
}

export interface SuckerPair {
  id: string // Unique identifier for the pair
  chainA: {
    chainId: number
    address: string
    projectId: string
    bridgeInfo?: SuckerBridgeInfo // Optional bridge detection info
  }
  chainB: {
    chainId: number
    address: string
    projectId: string
    bridgeInfo?: SuckerBridgeInfo // Optional bridge detection info
  }
}

export interface ProjectSuckerMapping {
  projectId: string
  chainId: number
  suckerPairs: JBSuckersPair[]
}

export interface SuckerDiscoveryResult {
  projectMappings: Map<string, ProjectSuckerMapping>
  suckerPairs: Map<string, SuckerPair>
}

export interface JBAccountingContext {
  token: string
  decimals: number
  currency: number
}

export interface IJBTerminal {
  address: string
}

// Claim data structures for backend integration
export interface JBLeaf {
  Index: string
  Beneficiary: string
  ProjectTokenCount: string
  TerminalTokenAmount: string
}

export interface JBClaim {
  Token: string
  Leaf: JBLeaf
  Proof: string[] // Array of 32-byte hex strings
}

// Bridge types for underlying implementations
export type BridgeType = 'ArbitrumCanonical' | 'OptimismCanonical' | 'CCIP' | 'unknown'

export interface BridgeInfo {
  type: BridgeType
  requiresPayment: boolean // Whether toRemote() requires payment
  hasAdditionalSteps: boolean // Whether there are steps after sent_to_remote
  displayName: string
  description: string
}

export interface SuckerBridgeInfo {
  suckerAddress: string
  chainId: number
  deployerAddress: string
  bridgeInfo: BridgeInfo
}