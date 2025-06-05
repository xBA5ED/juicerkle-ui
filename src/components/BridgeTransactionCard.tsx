'use client'

import Image from 'next/image'
import { BridgeTransaction } from '@/types/bridge'
import { formatStatus, getChainColor, getChainName } from '@/utils/chainUtils'
import { getAvailableChains } from '@/services/mockBridgeService'
import { ArrowRight } from './Icons'

interface BridgeTransactionCardProps {
  transaction: BridgeTransaction
  onClaim?: (transaction: BridgeTransaction) => void
}

export function BridgeTransactionCard({ transaction, onClaim }: BridgeTransactionCardProps) {
  const chains = getAvailableChains()
  const { sourceChainId, destinationChainId, token, amount, status } = transaction
  
  const isClaimable = status === 'awaiting_claim'
  
  return (
    <div className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 relative rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
            {token.logoUrl ? (
              <Image 
                src={token.logoUrl} 
                alt={token.symbol}
                width={32}
                height={32}
                style={{ objectFit: 'cover' }}
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="text-xs font-bold">{token.symbol.substring(0, 3)}</span>
            )}
          </div>
          <div>
            <h3 className="font-medium">{token.symbol}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{token.name}</p>
          </div>
        </div>
        <div className="px-3 py-1 rounded-full text-xs font-medium" 
          style={{
            backgroundColor: 
              status === 'awaiting_bridge' ? 'rgba(59, 130, 246, 0.1)' : 
              status === 'in_transit' ? 'rgba(245, 158, 11, 0.1)' :
              status === 'awaiting_claim' ? 'rgba(16, 185, 129, 0.1)' :
              'rgba(107, 114, 128, 0.1)',
            color:
              status === 'awaiting_bridge' ? 'rgb(59, 130, 246)' :
              status === 'in_transit' ? 'rgb(245, 158, 11)' :
              status === 'awaiting_claim' ? 'rgb(16, 185, 129)' :
              'rgb(107, 114, 128)'
          }}
        >
          {formatStatus(status)}
        </div>
      </div>
      
      <div className="text-xl font-semibold mb-4">
        {amount} {token.symbol}
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col items-center">
          <div 
            className="w-8 h-8 relative rounded-full overflow-hidden flex items-center justify-center mb-1 text-white"
            style={{ backgroundColor: getChainColor(sourceChainId) }}
          >
            <span className="text-xs font-bold">{getChainName(sourceChainId, chains).substring(0, 1)}</span>
          </div>
          <span className="text-xs">{getChainName(sourceChainId, chains)}</span>
        </div>
        
        <ArrowRight className="text-gray-400" />
        
        <div className="flex flex-col items-center">
          <div 
            className="w-8 h-8 relative rounded-full overflow-hidden flex items-center justify-center mb-1 text-white"
            style={{ backgroundColor: getChainColor(destinationChainId) }}
          >
            <span className="text-xs font-bold">{getChainName(destinationChainId, chains).substring(0, 1)}</span>
          </div>
          <span className="text-xs">{getChainName(destinationChainId, chains)}</span>
        </div>
      </div>
      
      {isClaimable && onClaim && (
        <button
          onClick={() => onClaim(transaction)}
          className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          Claim
        </button>
      )}
    </div>
  )
}