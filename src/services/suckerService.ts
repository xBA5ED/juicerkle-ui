import { createPublicClient, http, type Address, parseUnits, type Hash } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'
import { type JBOutboxTree, type JBClaim, type JBLeaf } from '@/types/bridge'

const SUCKER_ABI = [
  {
    name: 'prepare',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectTokenCount', type: 'uint256' },
      { name: 'beneficiary', type: 'address' },
      { name: 'minTokensReclaimed', type: 'uint256' },
      { name: 'token', type: 'address' }
    ],
    outputs: []
  },
  {
    name: 'toRemote',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' }
    ],
    outputs: []
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'claimData',
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          {
            name: 'leaf',
            type: 'tuple',
            components: [
              { name: 'index', type: 'uint256' },
              { name: 'beneficiary', type: 'address' },
              { name: 'projectTokenCount', type: 'uint256' },
              { name: 'terminalTokenAmount', type: 'uint256' }
            ]
          },
          { name: 'proof', type: 'bytes32[32]' }
        ]
      }
    ],
    outputs: []
  },
  {
    name: 'outboxOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'nonce', type: 'uint64' },
          { name: 'balance', type: 'uint256' },
          { 
            name: 'tree', 
            type: 'tuple',
            components: [
              { name: 'branch', type: 'bytes32[32]' },
              { name: 'count', type: 'uint256' }
            ]
          },
          { name: 'numberOfClaimsSent', type: 'uint256' }
        ]
      }
    ]
  }
] as const

const INSERT_TO_OUTBOX_TREE_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'beneficiary', type: 'address' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'hashed', type: 'bytes32' },
      { indexed: false, name: 'index', type: 'uint256' },
      { indexed: false, name: 'root', type: 'bytes32' },
      { indexed: false, name: 'projectTokenCount', type: 'uint256' },
      { indexed: false, name: 'terminalTokenAmount', type: 'uint256' },
      { indexed: false, name: 'caller', type: 'address' }
    ],
    name: 'InsertToOutboxTree',
    type: 'event'
  }
] as const

const CLAIM_EVENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'beneficiary', type: 'address' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'projectTokenCount', type: 'uint256' },
      { indexed: false, name: 'terminalTokenAmount', type: 'uint256' },
      { indexed: false, name: 'caller', type: 'address' }
    ],
    name: 'Claim',
    type: 'event'
  }
] as const

export interface PrepareParams {
  projectTokenCount: string
  beneficiary: Address
  minTokensReclaimed: string
  token: Address
}

export interface InsertToOutboxTreeEvent {
  beneficiary: Address
  token: Address
  hashed: string
  index: string
  root: string
  projectTokenCount: string
  terminalTokenAmount: string
  caller: Address
}

export interface ClaimEvent {
  beneficiary: Address
  token: Address
  projectTokenCount: string
  terminalTokenAmount: string
  caller: Address
}

function createClient(chainId: number) {
  const chain = SUPPORTED_CHAINS[chainId as SupportedChainId]
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return createPublicClient({
    chain,
    transport: http()
  })
}

class SuckerService {
  async getOutboxTree(
    chainId: number,
    suckerAddress: Address,
    tokenAddress: Address
  ): Promise<JBOutboxTree> {
    try {
      const client = createClient(chainId)
      
      const result = await client.readContract({
        address: suckerAddress,
        abi: SUCKER_ABI,
        functionName: 'outboxOf',
        args: [tokenAddress]
      })

      return {
        nonce: Number(result.nonce),
        balance: result.balance.toString(),
        tree: {
          branch: result.tree.branch,
          count: Number(result.tree.count)
        },
        numberOfClaimsSent: Number(result.numberOfClaimsSent)
      }
    } catch (error) {
      console.error('Failed to get outbox tree:', error)
      throw error
    }
  }

  async listenForInsertToOutboxTreeEvent(
    chainId: number,
    suckerAddress: Address,
    transactionHash: Hash,
    onEvent: (event: InsertToOutboxTreeEvent) => void
  ): Promise<void> {
    try {
      const client = createClient(chainId)
      
      // Get the transaction receipt to find the block number
      const receipt = await client.waitForTransactionReceipt({
        hash: transactionHash
      })

      // Get logs for the InsertToOutboxTree event from this transaction
      const logs = await client.getLogs({
        address: suckerAddress,
        event: INSERT_TO_OUTBOX_TREE_EVENT_ABI[0],
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      })

      // Find the log from our transaction
      const eventLog = logs.find(log => log.transactionHash === transactionHash)
      
      if (eventLog && eventLog.args) {
        const event: InsertToOutboxTreeEvent = {
          beneficiary: eventLog.args.beneficiary!,
          token: eventLog.args.token!,
          hashed: eventLog.args.hashed!,
          index: eventLog.args.index!.toString(),
          root: eventLog.args.root!,
          projectTokenCount: eventLog.args.projectTokenCount!.toString(),
          terminalTokenAmount: eventLog.args.terminalTokenAmount!.toString(),
          caller: eventLog.args.caller!
        }
        
        onEvent(event)
      }
    } catch (error) {
      console.error('Failed to listen for InsertToOutboxTree event:', error)
      throw error
    }
  }

  getPrepareFunctionData(params: PrepareParams, decimals: number) {
    const projectTokenCountBigInt = parseUnits(params.projectTokenCount, decimals)
    const minTokensReclaimedBigInt = parseUnits(params.minTokensReclaimed, decimals)

    return {
      address: undefined as any, // Will be set by caller
      abi: SUCKER_ABI,
      functionName: 'prepare' as const,
      args: [
        projectTokenCountBigInt,
        params.beneficiary,
        minTokensReclaimedBigInt,
        params.token
      ]
    }
  }

  getToRemoteFunctionData(tokenAddress: Address, requiresPayment: boolean = true) {
    return {
      address: undefined as any, // Will be set by caller
      abi: SUCKER_ABI,
      functionName: 'toRemote' as const,
      args: [tokenAddress],
      value: requiresPayment ? parseUnits('0.05', 18) : 0n // Only send ETH if payment is required
    }
  }

  /**
   * Prepare claim function data for calling sucker.claim()
   * Convert proof from [32][32]byte to bytes32[32]
   */
  getClaimFunctionData(claimData: JBClaim) {
    console.log('Preparing claim with data:', claimData)
    
    // Convert proof from array of byte arrays to array of hex strings
    const convertedProof = claimData.Proof.map((byteArray: any) => {
      if (Array.isArray(byteArray)) {
        // Convert array of bytes to hex string
        const hexString = '0x' + byteArray.map((byte: number) => 
          byte.toString(16).padStart(2, '0')
        ).join('')
        console.log('Converted byte array to hex:', byteArray.slice(0, 4), '...', '→', hexString.slice(0, 10) + '...')
        return hexString
      } else if (typeof byteArray === 'string') {
        // Already a hex string, ensure it has 0x prefix
        return byteArray.startsWith('0x') ? byteArray : `0x${byteArray}`
      } else {
        console.warn('Unexpected proof element type:', typeof byteArray, byteArray)
        return '0x0000000000000000000000000000000000000000000000000000000000000000'
      }
    })
    
    console.log('Converted proof length:', convertedProof.length)
    console.log('First converted proof element:', convertedProof[0])
    
    return {
      address: undefined as any, // Will be set by caller
      abi: SUCKER_ABI,
      functionName: 'claim' as const,
      args: [{
        token: claimData.Token,
        leaf: {
          index: claimData.Leaf.Index,
          beneficiary: claimData.Leaf.Beneficiary,
          projectTokenCount: claimData.Leaf.ProjectTokenCount,
          terminalTokenAmount: claimData.Leaf.TerminalTokenAmount
        },
        proof: convertedProof
      }]
    }
  }

  /**
   * Listen for Claim event after transaction confirmation
   */
  async listenForClaimEvent(
    chainId: number,
    suckerAddress: Address,
    transactionHash: Hash,
    onEvent: (event: ClaimEvent) => void
  ): Promise<void> {
    try {
      const client = createClient(chainId)
      
      console.log('Waiting for claim transaction to be confirmed...', transactionHash)
      
      // Wait for transaction receipt
      const receipt = await client.waitForTransactionReceipt({
        hash: transactionHash,
        timeout: 120000 // 2 minutes timeout
      })
      
      console.log('Claim transaction confirmed, looking for Claim event...')
      
      // Find the Claim event in the transaction logs
      const claimLogs = receipt.logs.filter(log => {
        try {
          // Try to decode as Claim event
          const decoded = client.decodeEventLog({
            abi: CLAIM_EVENT_ABI,
            data: log.data,
            topics: log.topics,
          })
          return decoded.eventName === 'Claim'
        } catch {
          return false
        }
      })
      
      if (claimLogs.length === 0) {
        throw new Error('No Claim event found in transaction receipt')
      }
      
      // Process the first claim event
      const claimLog = claimLogs[0]
      const decoded = client.decodeEventLog({
        abi: CLAIM_EVENT_ABI,
        data: claimLog.data,
        topics: claimLog.topics,
      })
      
      if (decoded.eventName === 'Claim') {
        const event: ClaimEvent = {
          beneficiary: decoded.args.beneficiary,
          token: decoded.args.token,
          projectTokenCount: decoded.args.projectTokenCount.toString(),
          terminalTokenAmount: decoded.args.terminalTokenAmount.toString(),
          caller: decoded.args.caller
        }
        
        console.log('Claim event captured:', event)
        onEvent(event)
      }
      
    } catch (error) {
      console.error('Failed to listen for Claim event:', error)
      throw error
    }
  }
}

export const suckerService = new SuckerService()