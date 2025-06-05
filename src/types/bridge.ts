export type BridgeStatus = 'awaiting_bridge' | 'in_transit' | 'awaiting_claim' | 'claimed'

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
  }
  chainB: {
    chainId: number
    address: string
    projectId: string
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