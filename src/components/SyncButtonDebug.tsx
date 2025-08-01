'use client'

import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'

interface SyncButtonDebugProps {
  storefrontId: string
  sellerId: string
  onSyncComplete?: () => void
  className?: string
}

export default function SyncButtonDebug({ storefrontId, sellerId, onSyncComplete, className = '' }: SyncButtonDebugProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  const handleSync = async () => {
    console.log('Sync button clicked', { storefrontId, sellerId })
    setLoading(true)
    setStatus(null)
    setDebugInfo(null)

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Session:', session ? 'Found' : 'Not found')
      
      if (!session) {
        throw new Error('No active session')
      }

      console.log('Making API request to /api/sync-products')
      const response = await fetch('/api/sync-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storefrontId,
          sellerId
        })
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      setDebugInfo({
        status: response.status,
        data: data
      })

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to sync products')
      }

      setStatus(`Synced ${data.count || 0} products (${data.asinCount || 0} total ASINs)`)
      if (onSyncComplete) {
        onSyncComplete()
      }

      // Clear status after 10 seconds
      setTimeout(() => setStatus(null), 10000)
    } catch (error: any) {
      console.error('Sync error:', error)
      setStatus(`Error: ${error.message}`)
      setDebugInfo({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
          title="Sync products from Amazon"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing...' : 'Sync Products (Debug)'}
        </button>
        
        {status && (
          <span className={`text-sm ${status.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {status}
          </span>
        )}
      </div>
      
      {debugInfo && (
        <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
    </div>
  )
}