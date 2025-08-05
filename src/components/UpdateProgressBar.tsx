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

interface BatchProgress {
  isProcessing: boolean
  totalStorefronts: number
  processedStorefronts: number
  currentBatch: number
  totalBatches: number
  currentStorefronts: string[]
  completedStorefronts: {
    id: string
    name: string
    productsAdded: number
    productsRemoved: number
    success: boolean
    error?: string
  }[]
  tokensUsed: number
  tokensAvailable: number
  startTime: string
  estimatedCompletion?: string
}

interface EnrichmentQueue {
  pending: number
  processing: number
  completed: number
  error: number
  total: number
}

interface BatchStatus {
  batch: BatchProgress | null
  enrichment: EnrichmentQueue
}

export default function UpdateProgressBar() {
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    let pollInterval: NodeJS.Timeout

    const fetchStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        // Get batch status
        const statusResponse = await fetch('/api/batch-status', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (statusResponse.ok) {
          const status = await statusResponse.json()
          setBatchStatus(status)
          setIsVisible(status.batch?.isProcessing || status.enrichment.pending > 0 || status.enrichment.processing > 0)
          setLastUpdate(new Date())
        }

      } catch (error) {
        console.error('Error fetching batch status:', error)
      }
    }

    // Initial fetch
    fetchStatus()

    // Poll every 2 seconds when there's activity
    if (batchStatus?.batch?.isProcessing || batchStatus?.enrichment.pending || batchStatus?.enrichment.processing) {
      pollInterval = setInterval(fetchStatus, 2000)
    } else {
      pollInterval = setInterval(fetchStatus, 30000) // Less frequent when idle
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [batchStatus?.batch?.isProcessing, batchStatus?.enrichment.pending, batchStatus?.enrichment.processing])

  // Auto-hide after completion
  useEffect(() => {
    if (batchStatus?.batch && !batchStatus.batch.isProcessing && batchStatus.enrichment.pending === 0 && batchStatus.enrichment.processing === 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setBatchStatus(null) // Clear the status to fully reset the component
      }, 5000) // Hide after 5 seconds

      return () => clearTimeout(timer)
    }
  }, [batchStatus])

  if (!isVisible || !batchStatus) {
    return null
  }

  const batch = batchStatus.batch
  const enrichment = batchStatus.enrichment
  
  // Calculate progress percentage
  const progressPercentage = batch && batch.totalStorefronts > 0
    ? (batch.processedStorefronts / batch.totalStorefronts) * 100
    : 0
    
  const isProcessing = batch?.isProcessing || enrichment.processing > 0
  const hasActivity = isProcessing || enrichment.pending > 0

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ArrowPathIcon className={`w-5 h-5 ${isProcessing ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
            {batch?.isProcessing ? 'Storefront Updates' : enrichment.processing > 0 ? 'Title Enrichment' : 'Updates Complete'}
          </h3>
          <button 
            onClick={async () => {
              setIsVisible(false)
              setBatchStatus(null) // Clear the status when manually closed
              
              // Also clear server-side progress
              try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.access_token) {
                  await fetch('/api/batch-status', {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${session.access_token}`
                    }
                  })
                }
              } catch (error) {
                console.error('Error clearing batch status:', error)
              }
            }}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Batch Progress Bar */}
        {batch && (
          <div className="mt-2">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{batch.processedStorefronts} of {batch.totalStorefronts} storefronts</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            {batch.totalBatches > 1 && (
              <div className="text-xs text-gray-500 mt-1">
                Batch {batch.currentBatch} of {batch.totalBatches}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Token Status */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CpuChipIcon className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Keepa Tokens:</span>
          </div>
          <span className={`font-medium ${(batch?.tokensAvailable || 0) > 50 ? 'text-green-600' : 'text-amber-600'}`}>
            {batch?.tokensAvailable || 0} available
          </span>
        </div>
        {batch?.tokensUsed && batch.tokensUsed > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Used {batch.tokensUsed} tokens this batch
          </div>
        )}
      </div>

      {/* Current Processing */}
      {batch?.isProcessing && batch.currentStorefronts.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />
            <span className="font-medium text-gray-900">Processing Batch {batch.currentBatch}</span>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            {batch.currentStorefronts.map((name, index) => (
              <div key={index} className="font-medium truncate">{name}</div>
            ))}
          </div>
        </div>
      )}

      {/* Title Enrichment Status */}
      {enrichment.total > 0 && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <ArrowPathIcon className={`w-4 h-4 ${enrichment.processing > 0 ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
            <span className="font-medium text-gray-900">Title Enrichment</span>
          </div>
          <div className="text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Progress:</span>
              <span>{enrichment.completed} / {enrichment.total} titles</span>
            </div>
            {enrichment.pending > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {enrichment.pending} pending, {enrichment.processing} processing
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Completions */}
      <div className="px-4 py-3 max-h-40 overflow-y-auto">
        <div className="space-y-2">
          {batch?.completedStorefronts.slice(-4).map((storefront, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              {storefront.success ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <ExclamationCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {storefront.name}
                </div>
                <div className={`text-xs ${storefront.success ? 'text-gray-500' : 'text-red-600'}`}>
                  {storefront.success ? (
                    `+${storefront.productsAdded} products, -${storefront.productsRemoved} products`
                  ) : (
                    storefront.error || 'Update failed'
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Footer */}
      {!isProcessing && hasActivity && (
        <div className="px-4 py-3 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {batch && batch.completedStorefronts.length > 0 && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircleIcon className="w-4 h-4" />
                  {batch.completedStorefronts.filter(s => s.success).length} completed
                </span>
              )}
              {enrichment.completed > 0 && (
                <span className="text-blue-600 flex items-center gap-1">
                  <ArrowPathIcon className="w-4 h-4" />
                  {enrichment.completed} titles enriched
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