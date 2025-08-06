'use client'

import { useState, useEffect } from 'react'
import { ClockIcon, BoltIcon } from '@heroicons/react/24/outline'

interface KeepaTokenInfo {
  availableTokens: number
  regenerationRate: number
  tokensPerStorefront: number
  storefrontsCanProcess: number
  maxTokens: number
  info: string
}

export default function KeepaTokenStatus() {
  const [tokenInfo, setTokenInfo] = useState<KeepaTokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTokenInfo = async () => {
    try {
      const response = await fetch('/api/keepa/tokens')
      const data = await response.json()
      
      if (data.success) {
        setTokenInfo(data)
        setError(null)
      } else {
        setError(data.error || 'Failed to fetch token information')
      }
    } catch (err) {
      setError('Network error')
      console.error('Error fetching token info:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTokenInfo()
    // Refresh token info every 30 seconds
    const interval = setInterval(fetchTokenInfo, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-600">
          <BoltIcon className="w-4 h-4" />
          <span className="text-sm">Keepa API: {error}</span>
        </div>
      </div>
    )
  }

  if (!tokenInfo) return null

  const isLowTokens = tokenInfo.availableTokens < 100
  const statusColor = isLowTokens ? 'text-amber-600' : 'text-green-600'
  const bgColor = isLowTokens ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'

  return (
    <div className={`border rounded-xl p-4 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BoltIcon className={`w-4 h-4 ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>
            Keepa Tokens: {tokenInfo.availableTokens}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <ClockIcon className="w-3 h-3" />
          <span>+{tokenInfo.regenerationRate}/min</span>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        Can process {tokenInfo.storefrontsCanProcess} storefront{tokenInfo.storefrontsCanProcess !== 1 ? 's' : ''} 
        ({tokenInfo.tokensPerStorefront} tokens each)
      </div>
      <div className="mt-1 text-xs text-blue-600 font-medium">
        💡 Tokens regenerate: {tokenInfo.regenerationRate}/min (max: {tokenInfo.maxTokens})
      </div>
    </div>
  )
}