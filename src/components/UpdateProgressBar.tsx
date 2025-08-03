'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  CheckCircleIcon, 
  ExclamationCircleIcon, 
  ClockIcon,
  ArrowPathIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline'

interface QueueStatus {
  isProcessing: boolean
  totalQueued: number
  processing: number
  completed: number
  errors: number
  availableTokens: number
}

interface UpdateQueueItem {
  id: string
  storefront_id: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  keepa_tokens_used?: number
  products_added?: number
  products_removed?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  storefronts: {
    name: string
  }
}

export default function UpdateProgressBar() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [queueItems, setQueueItems] = useState<UpdateQueueItem[]>([])
  const [isVisible, setIsVisible] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    let pollInterval: NodeJS.Timeout

    const fetchStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        // Get overall queue status
        const statusResponse = await fetch('/api/storefronts/update-all', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (statusResponse.ok) {
          const status = await statusResponse.json()
          setQueueStatus(status)
        }

        // Get detailed queue items
        const { data: items, error } = await supabase
          .from('storefront_update_queue')
          .select(`
            *,
            storefronts (
              name
            )
          `)
          .order('created_at', { ascending: true })

        if (!error && items) {
          setQueueItems(items)
          setIsVisible(items.length > 0)
          setLastUpdate(new Date())
        }

      } catch (error) {
        console.error('Error fetching update status:', error)
      }
    }

    // Initial fetch
    fetchStatus()

    // Poll every 5 seconds when there's activity
    if (queueStatus?.isProcessing || (queueStatus?.totalQueued && queueStatus.totalQueued > 0)) {
      pollInterval = setInterval(fetchStatus, 5000)
    } else {
      pollInterval = setInterval(fetchStatus, 30000) // Less frequent when idle
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [queueStatus?.isProcessing, queueStatus?.totalQueued])

  // Auto-hide after completion
  useEffect(() => {
    if (queueStatus && !queueStatus.isProcessing && queueStatus.totalQueued === queueStatus.completed + queueStatus.errors) {
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 10000) // Hide after 10 seconds

      return () => clearTimeout(timer)
    }
  }, [queueStatus])

  if (!isVisible || !queueStatus || (queueStatus.totalQueued || 0) === 0) {
    return null
  }

  const progressPercentage = (queueStatus.totalQueued || 0) > 0 
    ? (((queueStatus.completed || 0) + (queueStatus.errors || 0)) / (queueStatus.totalQueued || 1)) * 100
    : 0

  const currentItem = queueItems.find(item => item.status === 'processing')
  const completedItems = queueItems.filter(item => item.status === 'completed')
  const errorItems = queueItems.filter(item => item.status === 'error')

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ArrowPathIcon className={`w-5 h-5 ${queueStatus.isProcessing ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
            Storefront Updates
          </h3>
          <button 
            onClick={() => setIsVisible(false)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-2">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{(queueStatus.completed || 0) + (queueStatus.errors || 0)} of {queueStatus.totalQueued || 0} completed</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Token Status */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CpuChipIcon className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Keepa Tokens:</span>
          </div>
          <span className={`font-medium ${(queueStatus.availableTokens || 0) > 50 ? 'text-green-600' : 'text-amber-600'}`}>
            {queueStatus.availableTokens || 0} available
          </span>
        </div>
      </div>

      {/* Current Processing */}
      {currentItem && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />
            <span className="font-medium text-gray-900">Currently Processing</span>
          </div>
          <div className="text-sm text-gray-600">
            <div className="font-medium">{currentItem.storefronts.name}</div>
            {currentItem.started_at && (
              <div className="text-xs text-gray-500 mt-1">
                Started {new Date(currentItem.started_at).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Completions */}
      <div className="px-4 py-3 max-h-40 overflow-y-auto">
        <div className="space-y-2">
          {completedItems.slice(-3).map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {item.storefronts.name}
                </div>
                <div className="text-xs text-gray-500">
                  +{item.products_added || 0} products, -{item.products_removed || 0} products
                  {item.keepa_tokens_used && ` • ${item.keepa_tokens_used} tokens`}
                </div>
              </div>
            </div>
          ))}

          {errorItems.slice(-2).map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {item.storefronts.name}
                </div>
                <div className="text-xs text-red-600 truncate">
                  {item.error_message || 'Update failed'}
                </div>
              </div>
            </div>
          ))}

          {queueItems.filter(item => item.status === 'pending').slice(0, 2).map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <ClockIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-600 truncate">
                  {item.storefronts.name}
                </div>
                <div className="text-xs text-gray-500">
                  Waiting in queue
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Footer */}
      {!queueStatus.isProcessing && (queueStatus.totalQueued || 0) > 0 && (
        <div className="px-4 py-3 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {(queueStatus.completed || 0) > 0 && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4" />
                  {queueStatus.completed || 0} completed
                </span>
              )}
              {(queueStatus.errors || 0) > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <ExclamationCircleIcon className="w-4 h-4" />
                  {queueStatus.errors || 0} failed
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Last updated {lastUpdate.toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}