'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface DebugSyncProps {
  storefrontId: string
  sellerId: string
}

export default function DebugSync({ storefrontId, sellerId }: DebugSyncProps) {
  const [debugOutput, setDebugOutput] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const runDebug = async () => {
    setLoading(true)
    setDebugOutput(null)

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/debug-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify({ storefrontId, sellerId })
      })

      const data = await response.json()
      setDebugOutput(data)
    } catch (error: any) {
      setDebugOutput({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  const testKeepaDirectly = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/test-keepa-direct?sellerId=${sellerId}`)
      const data = await response.json()
      setDebugOutput(data)
    } catch (error: any) {
      setDebugOutput({ error: error.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-xl">
      <h4 className="font-medium text-gray-900 mb-3">Debug Tools</h4>
      
      <div className="flex gap-2 mb-4">
        <button
          onClick={runDebug}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
        >
          {loading ? 'Running...' : 'Run Full Debug'}
        </button>
        
        <button
          onClick={testKeepaDirectly}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
        >
          Test Keepa API Directly
        </button>
      </div>

      {debugOutput && (
        <pre className="bg-white p-4 rounded-lg text-xs overflow-auto max-h-96 border border-gray-200">
          {JSON.stringify(debugOutput, null, 2)}
        </pre>
      )}
    </div>
  )
}