'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  BuildingStorefrontIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CpuChipIcon,
  PlusIcon,
  MinusIcon,
  ChevronLeftIcon,
  ChevronRightIcon
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
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hasAutoOpened, setHasAutoOpened] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    let pollInterval: NodeJS.Timeout
    let timeInterval: NodeJS.Timeout

    const fetchProgress = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

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
            
            // Auto-show panel when scan starts
            if (progress.isProcessing && !hasAutoOpened) {
              setIsCollapsed(false)
              setHasAutoOpened(true)
            }
            
            // Reset auto-open flag when scan completes
            if (!progress.isProcessing && hasAutoOpened) {
              setTimeout(() => {
                setHasAutoOpened(false)
              }, 5000)
            }
            
            break
          }
        }
      } catch (error) {
        console.error('Error fetching scan progress:', error)
      }
    }

    fetchProgress()

    if (scanProgress?.isProcessing) {
      pollInterval = setInterval(fetchProgress, 2000)
      
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
  }, [scanProgress?.isProcessing, hasAutoOpened])

  // Don't render if no scan data
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
      return `${hours}h ${minutes}m`
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

  return (
    <div className={`fixed right-0 top-24 z-40 transition-transform duration-300 ease-in-out ${
      isCollapsed ? 'translate-x-[calc(100%-3rem)]' : 'translate-x-0'
    }`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute left-0 top-8 -translate-x-full bg-gradient-to-r from-purple-600 to-blue-600 text-white p-2.5 rounded-l-lg shadow-lg hover:shadow-xl transition-all"
        aria-label={isCollapsed ? 'Show scan progress' : 'Hide scan progress'}
      >
        {isCollapsed ? (
          <ChevronLeftIcon className="h-5 w-5" />
        ) : (
          <ChevronRightIcon className="h-5 w-5" />
        )}
      </button>

      {/* Main Panel */}
      <div className="bg-white rounded-l-xl shadow-2xl w-80 max-h-[calc(100vh-8rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <BuildingStorefrontIcon className="h-5 w-5" />
              <h3 className="text-sm font-semibold">
                Storefront Sync in Progress
              </h3>
            </div>
            <div className="text-lg font-bold">{Math.round(progressPercentage)}%</div>
          </div>
          
          <p className="text-xs text-white/80 mb-2">
            Processing {scanProgress.totalStorefronts} storefronts
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-white/80 mt-1">
            <span>{scanProgress.processedStorefronts} of {scanProgress.totalStorefronts}</span>
            {(() => {
              const remaining = estimateRemainingTime()
              return remaining ? <span>~{formatTime(remaining)} remaining</span> : null
            })()}
          </div>
        </div>

        {/* Current Processing */}
        {scanProgress.isProcessing && scanProgress.currentStorefront && (
          <div className="px-4 py-3 bg-blue-50 border-b border-gray-200">
            <div className="flex items-center space-x-2 mb-1">
              <ArrowPathIcon className="h-4 w-4 text-blue-600 animate-spin" />
              <span className="text-xs text-gray-600">Currently scanning</span>
            </div>
            <p className="text-sm font-medium text-gray-900 truncate">
              {scanProgress.currentStorefront}
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50">
          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <div className="flex items-center space-x-1 mb-1">
              <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-600">Time</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{formatTime(elapsedTime)}</p>
          </div>

          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <div className="flex items-center space-x-1 mb-1">
              <CpuChipIcon className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-600">Webscraping</span>
            </div>
            <p className="text-sm font-bold text-gray-900">{scanProgress.tokensAvailable}</p>
            <p className="text-xs text-gray-500">{scanProgress.tokensUsed} used</p>
          </div>

          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <div className="flex items-center space-x-1 mb-1">
              <PlusIcon className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-gray-600">Added</span>
            </div>
            <p className="text-sm font-bold text-green-600">+{totalProductsAdded}</p>
          </div>

          <div className="bg-white rounded-lg p-2 border border-gray-200">
            <div className="flex items-center space-x-1 mb-1">
              <MinusIcon className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-gray-600">Removed</span>
            </div>
            <p className="text-sm font-bold text-red-600">-{totalProductsRemoved}</p>
          </div>
        </div>

        {/* Recent Updates */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Recent Updates</h4>
          <div className="space-y-1">
            {scanProgress.completedStorefronts.slice(-5).reverse().map((store, index) => (
              <div key={index} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-2 min-w-0">
                  {store.success ? (
                    <CheckCircleIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{store.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(store.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-xs flex-shrink-0">
                  <span className="font-medium text-green-600">+{store.productsAdded}</span>
                  <span className="text-gray-400">/</span>
                  <span className="font-medium text-red-600">-{store.productsRemoved}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Summary */}
        <div className="px-4 py-2 bg-gray-100 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <span className="text-gray-600">Status: </span>
              <span className="font-semibold text-gray-900">
                {scanProgress.completedStorefronts.filter(s => s.success).length} Successful
              </span>
            </div>
            {!scanProgress.isProcessing && (
              <span className="text-xs font-semibold text-green-600">Complete</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}