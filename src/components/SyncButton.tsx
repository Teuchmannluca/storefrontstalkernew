'use client'

import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useProductSync } from '@/hooks/useProductSync'

interface SyncButtonProps {
  storefrontId: string
  sellerId: string
  storefrontName: string
  onSyncComplete?: () => void
  className?: string
  useKeepaAPI?: boolean
}

export default function SyncButton({ 
  storefrontId, 
  sellerId, 
  storefrontName, 
  onSyncComplete, 
  className = '', 
  useKeepaAPI = true 
}: SyncButtonProps) {
  const { syncStorefrontProducts } = useProductSync()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setStatus(null)

    try {
      const result = await syncStorefrontProducts(
        storefrontId, 
        sellerId, 
        storefrontName, 
        useKeepaAPI
      )
      
      if (result.success) {
        setStatus(result.message)
        if (onSyncComplete) {
          onSyncComplete()
        }
      } else {
        setStatus(result.error || 'Synchronisation failed')
      }

      // Clear status after 5 seconds
      setTimeout(() => setStatus(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
        title="Fetch products from Amazon using Keepa API"
      >
        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Fetching ASINs...' : 'Fetch Products'}
      </button>
      
      {status && (
        <span className={`text-sm ${status.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
          {status}
        </span>
      )}
    </div>
  )
}