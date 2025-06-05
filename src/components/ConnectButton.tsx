'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected)
    return (
      <div className="p-4 border rounded-lg bg-green-50 text-green-900 dark:bg-green-900 dark:text-green-50">
        <p className="mb-2 font-mono text-sm">Connected to {address?.substring(0, 6)}...{address?.substring(address.length - 4)}</p>
        <button 
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    )

  return (
    <button 
      className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-lg"
      onClick={() => connect({ connector: injected() })}
    >
      Connect Wallet
    </button>
  )
}