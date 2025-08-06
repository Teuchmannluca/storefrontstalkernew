'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  ClockIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface RateLimitStatusData {
  systemStatus: {
    totalQueuedRequests: number
    readyOperations: number
    totalOperations: number
    maxWaitTimeSeconds: number
    overallStatus: 'healthy' | 'busy' | 'overloaded'
  }
  operations: Array<{
    operation: string
    tokensAvailable: number
    queueLength: number
    estimatedWaitSeconds: number
    status: 'ready' | 'queued' | 'waiting'
    lastRequestTime: string | null
  }>
  timestamp: string
}

export default function RateLimitStatus() {
  const [status, setStatus] = useState<RateLimitStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/rate-limit-status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch rate limit status')
      }

      const data = await response.json()
      setStatus(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err: any) {
      console.error('Error fetching rate limit status:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2">
          <ArrowPathIcon className="h-5 w-5 animate-spin" />
          <span>Loading rate limit status...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          <span className="text-red-700">Error loading rate limit status: {error}</span>
        </div>
        <button
          onClick={fetchStatus}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!status) return null

  const getStatusColor = (systemStatus: string) => {
    switch (systemStatus) {
      case 'healthy': return 'text-green-600'
      case 'busy': return 'text-yellow-600'  
      case 'overloaded': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getOperationStatusIcon = (opStatus: string, tokensAvailable: number) => {
    if (opStatus === 'ready' && tokensAvailable > 0) {
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />
    } else if (opStatus === 'queued') {
      return <ClockIcon className="h-5 w-5 text-yellow-500" />
    } else {
      return <ClockIcon className="h-5 w-5 text-red-500" />
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">SP-API Rate Limit Status</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ArrowPathIcon className="h-4 w-4" />
          <span>Auto-refresh every 5s</span>
        </div>
      </div>

      {/* System Overview */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">System Status</h4>
            <p className={`text-lg font-semibold ${getStatusColor(status.systemStatus.overallStatus)}`}>
              {status.systemStatus.overallStatus.toUpperCase()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Queued Requests</p>
            <p className="text-2xl font-bold text-gray-900">{status.systemStatus.totalQueuedRequests}</p>
          </div>
        </div>
        
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Ready Operations</p>
            <p className="font-semibold">{status.systemStatus.readyOperations}/{status.systemStatus.totalOperations}</p>
          </div>
          <div>
            <p className="text-gray-600">Max Wait Time</p>
            <p className="font-semibold">{status.systemStatus.maxWaitTimeSeconds}s</p>
          </div>
          <div>
            <p className="text-gray-600">Last Updated</p>
            <p className="font-semibold">{lastUpdated?.toLocaleTimeString() || 'Never'}</p>
          </div>
        </div>
      </div>

      {/* Operations Status */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">API Operations</h4>
        {status.operations
          .filter(op => ['getCompetitivePricing', 'getCatalogItem', 'getMyFeesEstimateForASIN'].includes(op.operation))
          .map((operation) => (
          <div key={operation.operation} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              {getOperationStatusIcon(operation.status, operation.tokensAvailable)}
              <div>
                <div className="font-medium text-gray-900">
                  {operation.operation.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="text-sm text-gray-500">
                  Queue: {operation.queueLength} requests
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {operation.tokensAvailable} tokens
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {operation.estimatedWaitSeconds > 0 
                  ? `Wait: ${operation.estimatedWaitSeconds}s`
                  : 'Ready now'
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Usage Note */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> The system now uses correct Amazon SP-API rate limits: 
          Competitive Pricing (0.5 req/sec), Catalog Items (2 req/sec), Fees (1 req/sec).
          Sequential processing prevents burst violations.
        </p>
      </div>
    </div>
  )
}