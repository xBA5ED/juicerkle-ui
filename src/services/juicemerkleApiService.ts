import { type Address } from 'viem'

export interface ClaimsRequest {
    chainId: number
    sucker: string
    token: string
    beneficiary: string
}

export interface JBLeaf {
    Index: string // Changed from number to string to match bridge types
    Beneficiary: string
    ProjectTokenCount: string
    TerminalTokenAmount: string
}

export interface JBClaim {
    Token: string
    Leaf: JBLeaf
    Proof: string[] // Array of 32-byte hex strings, will be converted to [32][32]byte for contract calls
}

export interface ClaimsResponse {
    claims: JBClaim[]
}

class JuicemerkleApiService {
    private readonly baseUrl: string = process.env.JUICERKLE_API_URL || 'https://juicerkle-production.up.railway.app'

    async getClaims(request: ClaimsRequest): Promise<JBClaim[]> {
        try {
            console.log('Fetching claims from backend:', request)

            const response = await fetch(`${this.baseUrl}/claims`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request)
            })

            if (!response.ok) {
                throw new Error(`Backend API error: ${response.status} ${response.statusText}`)
            }

            const data: JBClaim[] = await response.json()
            console.log(`Received ${data.length} claims from backend for ${request.chainId}:${request.sucker}:${request.token}`)

            return data
        } catch (error) {
            console.error('Failed to fetch claims from backend:', error)
            throw error
        }
    }

    async getClaimsForBeneficiary(
        chainId: number,
        suckerAddress: Address,
        tokenAddress: Address,
        beneficiaryAddress: Address
    ): Promise<JBClaim[]> {
        const request: ClaimsRequest = {
            chainId: chainId,
            sucker: suckerAddress,
            token: tokenAddress,
            beneficiary: beneficiaryAddress
        }

        return this.getClaims(request)
    }
}

export const juicemerkleApiService = new JuicemerkleApiService()
