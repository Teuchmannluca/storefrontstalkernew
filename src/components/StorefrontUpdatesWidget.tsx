'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  BuildingStorefrontIcon,
  ArrowPathIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'

interface StorefrontUpdate {
  storefront_id: string
  storefront_name: string
  seller_id: string
  products_added_24h: number
  products_removed_24h: number
  total_products: number
  last_sync_completed_at: string | null
  last_sync_status: string
  recent_products: {
    asin: string
    product_name: string | null
    added_at: string
  }[]
}

interface UpdatesSummary {
  activeStorefronts: number
  totalNewProducts: number
  totalRemovedProducts: number
  lastUpdated: string
}

export default function StorefrontUpdatesWidget() {
  const [updates, setUpdates] = useState<StorefrontUpdate[]>([])
  const [summary, setSummary] = useState<UpdatesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRecentUpdates()
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchRecentUpdates, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchRecentUpdates = async () => {
    try {
      const response = await fetch('/api/dashboard/recent-updates')
      
      if (!response.ok) {
        throw new Error('Failed to fetch updates')
      }

      const data = await response.json()
      setUpdates(data.updates || [])
      setSummary(data.summary || null)
      setError(null)
    } catch (err) {
      console.error('Error fetching recent updates:', err)
      setError('Failed to load updates')
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never synced'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
    return `${Math.floor(diffInSeconds / 86400)} days ago`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600'
      case 'processing': return 'text-blue-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓'
      case 'processing': return '⟳'
      case 'error': return '✗'
      default: return '•'
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-yellow-500" />
            Storefront Updates (24h)
          </h3>
          <ArrowPathIcon className="w-5 h-5 animate-spin text-gray-400" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Storefront Updates</h3>
        <p className="text-red-600 text-sm">{error}</p>
        <button 
          onClick={fetchRecentUpdates}
          className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-yellow-500" />
          Storefront Updates (24h)
        </h3>
        <button
          onClick={fetchRecentUpdates}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh"
        >
          <ArrowPathIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Summary Stats */}
      {summary && (summary.totalNewProducts > 0 || summary.totalRemovedProducts > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500">Active</p>
            <p className="text-lg font-bold text-gray-800">{summary.activeStorefronts}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">New ASINs</p>
            <p className="text-lg font-bold text-green-600">+{summary.totalNewProducts}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Removed</p>
            <p className="text-lg font-bold text-red-600">-{summary.totalRemovedProducts}</p>
          </div>
        </div>
      )}

      {/* Updates List */}
      {updates.length === 0 ? (
        <div className="text-center py-8">
          <BuildingStorefrontIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No updates in the last 24 hours</p>
          <p className="text-gray-400 text-xs mt-1">Storefronts will appear here after syncing</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {updates.map((update) => (
            <Link
              key={update.storefront_id}
              href={`/dashboard/storefronts/${update.storefront_id}`}
              className="block group"
            >
              <div className="p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all">
                {/* Storefront Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BuildingStorefrontIcon className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
                        {update.storefront_name}
                      </h4>
                      <p className="text-xs text-gray-500">{update.seller_id}</p>
                    </div>
                  </div>
                  <span className={`text-xs ${getStatusColor(update.last_sync_status)}`}>
                    {getStatusIcon(update.last_sync_status)}
                  </span>
                </div>

                {/* Stats Row */}
                <div className="flex items-center gap-4 text-sm">
                  {update.products_added_24h > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                      <span className="text-green-600 font-medium">+{update.products_added_24h}</span>
                    </div>
                  )}
                  {update.products_removed_24h > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowTrendingDownIcon className="w-4 h-4 text-red-600" />
                      <span className="text-red-600 font-medium">-{update.products_removed_24h}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-gray-500">
                    <ClockIcon className="w-4 h-4" />
                    <span className="text-xs">{formatTimeAgo(update.last_sync_completed_at)}</span>
                  </div>
                  <div className="ml-auto text-xs text-gray-500">
                    {update.total_products} total
                  </div>
                </div>

                {/* Recent Products Preview */}
                {update.recent_products.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-xs text-gray-500 mb-1">Recent ASINs:</p>
                    <div className="flex flex-wrap gap-1">
                      {update.recent_products.slice(0, 3).map((product) => (
                        <span 
                          key={product.asin}
                          className="text-xs bg-gray-100 px-2 py-0.5 rounded-md"
                          title={product.product_name || product.asin}
                        >
                          {product.asin}
                        </span>
                      ))}
                      {update.recent_products.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{update.recent_products.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* View All Link */}
      {updates.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Link 
            href="/dashboard/storefronts"
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          >
            View all storefronts
            <span className="text-xs">→</span>
          </Link>
        </div>
      )}
    </div>
  )
}