import { createPublicClient, http, type Address } from 'viem'
import { SUPPORTED_CHAINS, type SupportedChainId } from '@/utils/chainUtils'
import { type BridgeType, type BridgeInfo, type SuckerBridgeInfo, type BridgeDirectionConfig } from '@/types/bridge'

// ABI for checking if a sucker was deployed by a specific deployer
const DEPLOYER_ABI = [
    {
        inputs: [{ name: 'sucker', type: 'address' }],
        name: 'isSucker',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function'
    }
] as const

// Known deployer addresses mapped to bridge types
const DEPLOYER_TO_BRIDGE_TYPE: Record<string, BridgeType> = {
    // ArbitrumCanonical deployer addresses
    '0x5021c398d556925315c73a8f559d98117723967a': 'ArbitrumCanonical',

    // OptimismCanonical deployer addresses
    '0x8ca8816d6740fe474be2399f5fd7996e79e055a0': 'OptimismCanonical', // BASE
    '0x5de5ea969fe0f4e2ee9efc50591857fd83ed7095': 'OptimismCanonical', // OP

    // CCIP deployer addresses
    '0x34b40205b249e5733cf93d86b7c9783b015dd3e7': 'CCIP',
    '0xde901ebafc70d545f9d43034308c136ce8c94a5c': 'CCIP',
    '0x9d4858cc9d3552507eeabce722787afef64c615e': 'CCIP',
}

// Bridge configuration and characteristics with directional support
const BRIDGE_CONFIGS: Record<BridgeType, BridgeInfo> = {
    ArbitrumCanonical: {
        type: 'ArbitrumCanonical',
        displayName: 'Arbitrum Canonical Bridge',
        description: 'Official Arbitrum bridge for secure cross-chain transfers',
        l1ToL2: {
            requiresPayment: false,
            hasAdditionalSteps: false,
            estimatedTimeMinutes: 10
        },
        l2ToL1: {
            requiresPayment: true, // L2 -> L1 requires payment for finalization
            hasAdditionalSteps: true, // 7-day challenge period
            estimatedTimeMinutes: 10080 // ~7 days
        },
        l2ToL2: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 20
        }
    },
    OptimismCanonical: {
        type: 'OptimismCanonical',
        displayName: 'Optimism Canonical Bridge',
        description: 'Official Optimism bridge for secure cross-chain transfers',
        l1ToL2: {
            requiresPayment: false,
            hasAdditionalSteps: false,
            estimatedTimeMinutes: 5
        },
        l2ToL1: {
            requiresPayment: false, // L2 -> L1 requires payment for finalization
            hasAdditionalSteps: true, // 7-day challenge period
            estimatedTimeMinutes: 10080 // ~7 days
        },
        l2ToL2: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 15
        }
    },
    CCIP: {
        type: 'CCIP',
        displayName: 'Chainlink CCIP',
        description: 'Chainlink Cross-Chain Interoperability Protocol',
        l1ToL2: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 20
        },
        l2ToL1: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 25
        },
        l2ToL2: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 30
        }
    },
    unknown: {
        type: 'unknown',
        displayName: 'Unknown Bridge',
        description: 'Bridge implementation could not be determined',
        l1ToL2: {
            requiresPayment: true, // Conservative defaults
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 30
        },
        l2ToL1: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 60
        },
        l2ToL2: {
            requiresPayment: true,
            hasAdditionalSteps: true,
            estimatedTimeMinutes: 45
        }
    }
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

class BridgeDetectionService {
    // Cache for bridge detection results
    private bridgeCache = new Map<string, SuckerBridgeInfo>()

    /**
     * Get the bridge type for a given sucker by checking each deployer's isSucker mapping
     */
    private async getSuckerBridgeType(chainId: number, suckerAddress: Address): Promise<BridgeType> {
        const client = createClient(chainId)

        // Check each known deployer to see if it deployed this sucker
        for (const [deployerAddress, bridgeType] of Object.entries(DEPLOYER_TO_BRIDGE_TYPE)) {
            try {
                const isSucker = await client.readContract({
                    address: deployerAddress as Address,
                    abi: DEPLOYER_ABI,
                    functionName: 'isSucker',
                    args: [suckerAddress],
                }) as boolean;

                if (isSucker) {
                    return bridgeType as BridgeType;
                }
            } catch (error) {
                // Contract might not exist on this chain or function might revert
                // Continue checking other deployers
                console.debug(`Deployer ${deployerAddress} check failed for sucker ${suckerAddress} on chain ${chainId}:`, error);
            }
        }

        // No deployer claimed this sucker
        return 'unknown';
    }

    /**
     * Determine bridge direction based on source and target chain IDs
     */
    private getBridgeDirection(sourceChainId: number, targetChainId: number): 'l1ToL2' | 'l2ToL1' | 'l2ToL2' {
        const L1_CHAINS = [1, 11155111] // Ethereum mainnet and Sepolia
        const L2_CHAINS = [10, 8453, 42161, 11155420, 84532, 421614] // Optimism, Base, Arbitrum + testnets

        const isSourceL1 = L1_CHAINS.includes(sourceChainId)
        const isTargetL1 = L1_CHAINS.includes(targetChainId)
        const isSourceL2 = L2_CHAINS.includes(sourceChainId)
        const isTargetL2 = L2_CHAINS.includes(targetChainId)

        if (isSourceL1 && isTargetL2) {
            return 'l1ToL2'
        } else if (isSourceL2 && isTargetL1) {
            return 'l2ToL1'
        } else if (isSourceL2 && isTargetL2) {
            return 'l2ToL2'
        } else {
            // Default to l2ToL2 for unknown combinations (conservative)
            return 'l2ToL2'
        }
    }

    /**
     * Get bridge direction configuration for a specific bridge type and direction
     */
    getBridgeDirectionConfig(bridgeType: BridgeType, sourceChainId: number, targetChainId: number): BridgeDirectionConfig {
        const bridgeInfo = this.getBridgeInfo(bridgeType)
        const direction = this.getBridgeDirection(sourceChainId, targetChainId)
        return bridgeInfo[direction]
    }

    /**
     * Get bridge information for a specific bridge type
     */
    getBridgeInfo(bridgeType: BridgeType): BridgeInfo {
        return BRIDGE_CONFIGS[bridgeType]
    }

    /**
     * Detect the underlying bridge implementation for a sucker contract
     */
    async detectSuckerBridge(chainId: number, suckerAddress: Address): Promise<SuckerBridgeInfo> {
        const cacheKey = `${chainId}-${suckerAddress.toLowerCase()}`

        // Return cached result if available
        if (this.bridgeCache.has(cacheKey)) {
            return this.bridgeCache.get(cacheKey)!
        }

        try {
            // Determine bridge type by checking deployer contracts
            const bridgeType = await this.getSuckerBridgeType(chainId, suckerAddress)

            // Get bridge configuration
            const bridgeInfo = this.getBridgeInfo(bridgeType)

            const result: SuckerBridgeInfo = {
                suckerAddress: suckerAddress.toLowerCase(),
                chainId,
                deployerAddress: 'detected', // We don't store specific deployer anymore
                bridgeInfo
            }

            // Cache the result
            this.bridgeCache.set(cacheKey, result)

            console.log(`Detected bridge for sucker ${suckerAddress} on chain ${chainId}:`, result)

            return result
        } catch (error) {
            console.error(`Failed to detect bridge for sucker ${suckerAddress} on chain ${chainId}:`, error)

            // Return unknown bridge as fallback
            const fallbackResult: SuckerBridgeInfo = {
                suckerAddress: suckerAddress.toLowerCase(),
                chainId,
                deployerAddress: 'unknown',
                bridgeInfo: this.getBridgeInfo('unknown')
            }

            this.bridgeCache.set(cacheKey, fallbackResult)
            return fallbackResult
        }
    }

    /**
     * Batch detect bridge implementations for multiple suckers (parallel)
     */
    async detectMultipleSuckerBridges(suckers: Array<{ chainId: number; address: Address }>): Promise<SuckerBridgeInfo[]> {
        const promises = suckers.map(({ chainId, address }) =>
            this.detectSuckerBridge(chainId, address)
        )

        return Promise.all(promises)
    }

    /**
     * Sequential detect bridge implementations for multiple suckers (to avoid rate limiting)
     */
    async detectMultipleSuckerBridgesSequential(suckers: Array<{ chainId: number; address: Address }>): Promise<SuckerBridgeInfo[]> {
        const results: SuckerBridgeInfo[] = []
        
        for (const { chainId, address } of suckers) {
            try {
                const bridgeInfo = await this.detectSuckerBridge(chainId, address)
                results.push(bridgeInfo)
            } catch (error) {
                console.error(`Failed to detect bridge for sucker ${address} on chain ${chainId}:`, error)
                // Add fallback result
                results.push({
                    suckerAddress: address.toLowerCase(),
                    chainId,
                    deployerAddress: 'unknown',
                    bridgeInfo: this.getBridgeInfo('unknown')
                })
            }
        }
        
        return results
    }

    /**
     * Check if a bridge requires payment for toRemote() calls (direction-aware)
     */
    async requiresPaymentForToRemote(sourceChainId: number, suckerAddress: Address, targetChainId: number): Promise<boolean> {
        const bridgeInfo = await this.detectSuckerBridge(sourceChainId, suckerAddress)
        const directionConfig = this.getBridgeDirectionConfig(bridgeInfo.bridgeInfo.type, sourceChainId, targetChainId)
        return directionConfig.requiresPayment
    }

    /**
     * Check if a bridge has additional steps after sent_to_remote (direction-aware)
     */
    async hasAdditionalStepsAfterSentToRemote(sourceChainId: number, suckerAddress: Address, targetChainId: number): Promise<boolean> {
        const bridgeInfo = await this.detectSuckerBridge(sourceChainId, suckerAddress)
        const directionConfig = this.getBridgeDirectionConfig(bridgeInfo.bridgeInfo.type, sourceChainId, targetChainId)
        return directionConfig.hasAdditionalSteps
    }

    /**
     * Get estimated completion time for a bridge (direction-aware)
     */
    async getBridgeEstimatedTime(sourceChainId: number, suckerAddress: Address, targetChainId: number): Promise<number> {
        const bridgeInfo = await this.detectSuckerBridge(sourceChainId, suckerAddress)
        const directionConfig = this.getBridgeDirectionConfig(bridgeInfo.bridgeInfo.type, sourceChainId, targetChainId)
        return directionConfig.estimatedTimeMinutes
    }

    /**
     * Get human-readable bridge name for display
     */
    async getBridgeDisplayName(chainId: number, suckerAddress: Address): Promise<string> {
        const bridgeInfo = await this.detectSuckerBridge(chainId, suckerAddress)
        return bridgeInfo.bridgeInfo.displayName
    }

    /**
     * Get bridge direction configuration for a transaction
     */
    async getBridgeConfigForTransaction(sourceChainId: number, suckerAddress: Address, targetChainId: number): Promise<{
        bridgeInfo: BridgeInfo
        directionConfig: BridgeDirectionConfig
        direction: 'l1ToL2' | 'l2ToL1' | 'l2ToL2'
    }> {
        const bridgeInfo = await this.detectSuckerBridge(sourceChainId, suckerAddress)
        const direction = this.getBridgeDirection(sourceChainId, targetChainId)
        const directionConfig = bridgeInfo.bridgeInfo[direction]

        return {
            bridgeInfo: bridgeInfo.bridgeInfo,
            directionConfig,
            direction
        }
    }

    /**
     * Clear cache (useful for testing or when deployer mappings are updated)
     */
    clearCache(): void {
        this.bridgeCache.clear()
    }

    /**
     * Update deployer mappings (for when real addresses are provided)
     */
    updateDeployerMappings(newMappings: Record<string, BridgeType>): void {
        // Clear cache since mappings have changed
        this.clearCache()

        // Update the mappings
        Object.assign(DEPLOYER_TO_BRIDGE_TYPE, newMappings)

        console.log('Updated deployer mappings:', DEPLOYER_TO_BRIDGE_TYPE)
    }

    /**
     * Get all current deployer mappings (for debugging)
     */
    getDeployerMappings(): Record<string, BridgeType> {
        return { ...DEPLOYER_TO_BRIDGE_TYPE }
    }
}

export const bridgeDetectionService = new BridgeDetectionService()
