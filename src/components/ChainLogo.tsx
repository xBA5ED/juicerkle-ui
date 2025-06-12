import { getChainColor } from '@/utils/chainUtils'

interface ChainLogoProps {
  chainId: number
  chainName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ChainLogo({ chainId, chainName, size = 'md', className = '' }: ChainLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base'
  }
  
  const chainColor = getChainColor(chainId)
  const initials = chainName.substring(0, 2).toUpperCase()
  
  return (
    <div 
      className={`relative rounded-full overflow-hidden flex items-center justify-center text-white font-bold ${sizeClasses[size]} ${className}`}
      style={{ backgroundColor: chainColor }}
    >
      {initials}
    </div>
  )
}