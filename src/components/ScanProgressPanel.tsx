'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  BuildingStorefrontIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  SparklesIcon,
  ChartBarIcon,
  CpuChipIcon,
  PlusIcon,
  MinusIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MinusSmallIcon,
  PlusSmallIcon
} from '@heroicons/react/24/outline'

interface ScanProgress {
  isProcessing: boolean
  totalStorefronts: number
  processedStorefronts: number
  currentStorefront?: string
  currentStorefrontNumber?: number
  productsFound?: number
  newProducts?: number
  removedProducts?: number
  tokensUsed: number
  tokensAvailable: number
  startTime: string
  estimatedTimeRemaining?: number
  completedStorefronts: {
    name: string
    productsAdded: number
    productsRemoved: number
    success: boolean
    timestamp: string
  }[]
  enrichmentQueue?: {
    pending: number
    processing: number
    completed: number
  }
}

export default function ScanProgressPanel() {
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let pollInterval: NodeJS.Timeout
    let timeInterval: NodeJS.Timeout

    const fetchProgress = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        // Try multiple endpoints to get progress
        const endpoints = [
          '/api/storefronts/update-sequential',
          '/api/batch-status'
        ]

        for (const endpoint of endpoints) {
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })

          if (response.ok) {
            const data = await response.json()
            
            // Transform data to our format
            const progress: ScanProgress = {
              isProcessing: data.isProcessing || data.batch?.isProcessing || false,
              totalStorefronts: data.totalStorefronts || data.batch?.totalStorefronts || 0,
              processedStorefronts: data.processedStorefronts || data.batch?.processedStorefronts || 0,
              currentStorefront: data.currentStorefront || data.batch?.currentStorefronts?.[0],
              currentStorefrontNumber: data.processedStorefronts ? data.processedStorefronts + 1 : undefined,
              productsFound: data.productsFound,
              newProducts: data.newProducts,
              removedProducts: data.removedProducts,
              tokensUsed: data.tokensUsed || data.batch?.tokensUsed || 0,
              tokensAvailable: data.tokensAvailable || data.batch?.tokensAvailable || 0,
              startTime: data.startTime || data.batch?.startTime || new Date().toISOString(),
              estimatedTimeRemaining: data.estimatedTimeRemaining,
              completedStorefronts: data.completedStorefronts || data.batch?.completedStorefronts || [],
              enrichmentQueue: data.enrichment || data.enrichmentQueue
            }

            setScanProgress(progress)
            
            // Auto-expand when processing starts
            if (progress.isProcessing && !isExpanded) {
              setIsExpanded(true)
            }
            
            break
          }
        }
      } catch (error) {
        console.error('Error fetching scan progress:', error)
      }
    }

    // Initial fetch
    fetchProgress()

    // Poll frequently when processing
    if (scanProgress?.isProcessing) {
      pollInterval = setInterval(fetchProgress, 2000)
      
      // Update elapsed time
      if (scanProgress.startTime) {
        timeInterval = setInterval(() => {
          const start = new Date(scanProgress.startTime).getTime()
          const now = Date.now()
          setElapsedTime(Math.floor((now - start) / 1000))
        }, 1000)
      }
    } else {
      pollInterval = setInterval(fetchProgress, 10000)
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval)
      if (timeInterval) clearInterval(timeInterval)
    }
  }, [scanProgress?.isProcessing])

  if (!scanProgress || (!scanProgress.isProcessing && scanProgress.processedStorefronts === 0)) {
    return null
  }

  const progressPercentage = scanProgress.totalStorefronts > 0
    ? (scanProgress.processedStorefronts / scanProgress.totalStorefronts) * 100
    : 0

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  const estimateRemainingTime = () => {
    if (scanProgress.processedStorefronts === 0) return null
    
    const avgTimePerStore = elapsedTime / scanProgress.processedStorefronts
    const remaining = scanProgress.totalStorefronts - scanProgress.processedStorefronts
    return Math.floor(avgTimePerStore * remaining)
  }

  const totalProductsAdded = scanProgress.completedStorefronts.reduce((sum, s) => sum + s.productsAdded, 0)
  const totalProductsRemoved = scanProgress.completedStorefronts.reduce((sum, s) => sum + s.productsRemoved, 0)
  const successfulScans = scanProgress.completedStorefronts.filter(s => s.success).length
  const failedScans = scanProgress.completedStorefronts.filter(s => !s.success).length

  // Minimized view
  if (isMinimized) {
    return (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 w-[90%] max-w-2xl bg-white rounded-lg shadow-lg border border-gray-200 z-50">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <BuildingStorefrontIcon className="w-5 h-5 text-white flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-white truncate">
                    Syncing: {scanProgress.processedStorefronts}/{scanProgress.totalStorefronts} storefronts
                  </span>
                  <span className="text-sm font-bold text-white">
                    {Math.round(progressPercentage)}%
                  </span>
                </div>
                <div className="mt-1">
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div 
                      className="bg-white h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
              {scanProgress.currentStorefront && (
                <div className="flex items-center gap-2 text-white/90 text-sm">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  <span className="truncate max-w-[200px]">{scanProgress.currentStorefront}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="ml-3 p-1.5 hover:bg-white/20 rounded transition-colors flex-shrink-0"
              title="Expand panel"
            >
              <PlusSmallIcon className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 w-[90%] max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-200 z-50">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <BuildingStorefrontIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                Storefront Sync in Progress
              </h2>
              <p className="text-indigo-100 text-sm">
                Processing {scanProgress.totalStorefronts} storefronts with live updates
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Minimize panel"
            >
              <MinusSmallIcon className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title={isExpanded ? "Collapse details" : "Expand details"}
            >
              <svg className={`w-5 h-5 text-white transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm text-white/90 mb-2">
            <span className="font-medium">
              {scanProgress.processedStorefronts} of {scanProgress.totalStorefronts} storefronts
            </span>
            <span className="font-bold">{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3 backdrop-blur-sm">
            <div 
              className="bg-white h-3 rounded-full transition-all duration-500 relative overflow-hidden"
              style={{ width: `${progressPercentage}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Current Processing */}
          {scanProgress.isProcessing && scanProgress.currentStorefront && (
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ArrowPathIcon className="w-6 h-6 text-indigo-600 animate-spin" />
                  <div>
                    <p className="text-sm text-gray-600">Currently scanning</p>
                    <p className="text-lg font-bold text-gray-900">
                      {scanProgress.currentStorefront}
                    </p>
                    {scanProgress.currentStorefrontNumber && (
                      <p className="text-xs text-gray-500">
                        Storefront {scanProgress.currentStorefrontNumber} of {scanProgress.totalStorefronts}
                      </p>
                    )}
                  </div>
                </div>
                {scanProgress.productsFound !== undefined && (
                  <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-600">{scanProgress.productsFound}</p>
                    <p className="text-sm text-gray-600">products found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gray-50">
            {/* Time Stats */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <ClockIcon className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">Time Elapsed</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatTime(elapsedTime)}</p>
              {(() => {
                const remaining = estimateRemainingTime()
                return remaining ? (
                  <p className="text-xs text-gray-500 mt-1">
                    ~{formatTime(remaining)} remaining
                  </p>
                ) : null
              })()}
            </div>

            {/* Token Stats */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <CpuChipIcon className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">Keepa Tokens</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{scanProgress.tokensAvailable}</p>
              <p className="text-xs text-gray-500 mt-1">
                {scanProgress.tokensUsed} used
              </p>
            </div>

            {/* Products Added */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <PlusIcon className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-600">New Products</span>
              </div>
              <p className="text-xl font-bold text-green-600">+{totalProductsAdded}</p>
              <p className="text-xs text-gray-500 mt-1">
                added to catalog
              </p>
            </div>

            {/* Products Removed */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <MinusIcon className="w-5 h-5 text-red-500" />
                <span className="text-sm text-gray-600">Removed</span>
              </div>
              <p className="text-xl font-bold text-red-600">-{totalProductsRemoved}</p>
              <p className="text-xs text-gray-500 mt-1">
                outdated products
              </p>
            </div>
          </div>

          {/* Recent Completions */}
          <div className="px-6 py-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Updates</h3>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {scanProgress.completedStorefronts.slice(-5).reverse().map((store, index) => (
                <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {store.success ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{store.name}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(store.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-green-600">+{store.productsAdded}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-sm font-medium text-red-600">-{store.productsRemoved}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Summary */}
          <div className="px-6 py-4 bg-gray-100 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {successfulScans} Successful
                  </span>
                </div>
                {failedScans > 0 && (
                  <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {failedScans} Failed
                    </span>
                  </div>
                )}
                {scanProgress.enrichmentQueue && scanProgress.enrichmentQueue.pending > 0 && (
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-purple-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {scanProgress.enrichmentQueue.pending} titles queued
                    </span>
                  </div>
                )}
              </div>
              {!scanProgress.isProcessing && (
                <button
                  onClick={() => setScanProgress(null)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

<style jsx>{`
  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
`}</style>