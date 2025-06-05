import { createPublicClient, http, type Address, parseUnits, type Hash } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'

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
}

export const suckerService = new SuckerService()