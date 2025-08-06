'use client'

import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useProductSync } from '@/hooks/useProductSync'
import { useSyncStatus } from '@/contexts/SyncStatusContext'

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
  const { addSyncOperation, updateSyncOperation } = useSyncStatus()
  const [loading, setLoading] = useState(false)

  const handleSync = async () => {
    setLoading(true)
    const operationId = `sync-${storefrontId}-${Date.now()}`
    
    // Add operation to global status
    addSyncOperation({
      id: operationId,
      type: 'storefront_sync',
      storefront: storefrontName,
      status: 'active',
      message: 'Checking Keepa tokens...'
    })

    try {
      // Step 1: Check token availability
      updateSyncOperation(operationId, {
        message: 'Fetching ASINs from Keepa...'
      })

      const result = await syncStorefrontProducts(
        storefrontId, 
        sellerId, 
        storefrontName, 
        useKeepaAPI
      )
      
      if (result.success) {
        updateSyncOperation(operationId, {
          status: 'completed',
          message: result.message
        })
        if (onSyncComplete) {
          onSyncComplete()
        }
      } else {
        // Handle different types of errors
        if (result.error?.includes('Insufficient Keepa API tokens')) {
          updateSyncOperation(operationId, {
            status: 'error',
            message: 'Not enough Keepa tokens. Wait for regeneration.'
          })
        } else if (result.error?.includes('rate limit')) {
          updateSyncOperation(operationId, {
            status: 'error',
            message: 'Keepa API rate limit hit. Please wait a few minutes before retrying.'
          })
        } else {
          updateSyncOperation(operationId, {
            status: 'error',
            message: result.error || 'Synchronisation failed'
          })
        }
      }
    } catch (error: any) {
      updateSyncOperation(operationId, {
        status: 'error',
        message: error.message || 'Sync failed'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
      title="Step 1: Keepa fetches ASINs, Step 2: Amazon API gets product details"
    >
      <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Syncing...' : 'Sync Storefront'}
    </button>
  )
}