'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { 
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CalendarIcon,
  ShoppingBagIcon,
  TrophyIcon,
  MagnifyingGlassIcon,
  TrashIcon
} from '@heroicons/react/24/outline'

interface SavedScan {
  id: string
  scan_type: string
  storefront_name: string
  status: string
  total_products: number
  unique_asins: number
  opportunities_found: number
  started_at: string
  completed_at: string | null
  metadata?: {
    exchange_rate?: number
    total_profit?: number
  }
}

interface SavedScansInlineProps {
  onLoadScan: (scanId: string) => void
}

export default function SavedScansInline({ onLoadScan }: SavedScansInlineProps) {
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Delete functionality state
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null)

  useEffect(() => {
    fetchSavedScans()
  }, [])

  const fetchSavedScans = async () => {
    try {
      const { data, error } = await supabase
        .from('arbitrage_scans')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)

      if (!error && data) {
        setSavedScans(data)
      }
    } catch (error) {
      console.error('Error fetching saved scans:', error)
    } finally {
      setLoading(false)
    }
  }

  const getScanTypeLabel = (type: string) => {
    switch (type) {
      case 'a2a_eu':
        return 'A2A EU'
      case 'single_storefront':
        return 'Single'
      case 'all_storefronts':
        return 'All'
      default:
        return type
    }
  }

  const getScanTypeColor = (type: string) => {
    switch (type) {
      case 'a2a_eu':
        return 'bg-violet-100 text-violet-700'
      case 'single_storefront':
        return 'bg-blue-100 text-blue-700'
      case 'all_storefronts':
        return 'bg-green-100 text-green-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <ArrowPathIcon className="w-3 h-3 animate-spin" />
      case 'completed':
        return <CheckCircleIcon className="w-3 h-3" />
      case 'failed':
        return <XCircleIcon className="w-3 h-3" />
      default:
        return <ClockIcon className="w-3 h-3" />
    }
  }

  const formatTimeAgo = (date: string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return past.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const handleDeleteScan = async (scanId: string) => {
    try {
      setDeletingScanId(scanId)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('User not logged in')
        return
      }

      const response = await fetch(`/api/arbitrage/scans/${scanId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete scan')
      }

      // Remove the scan from the local state
      setSavedScans(prevScans => prevScans.filter(scan => scan.id !== scanId))
      
    } catch (error) {
      console.error('Error deleting scan:', error)
    } finally {
      setDeletingScanId(null)
    }
  }


  const filteredScans = savedScans
    .filter(scan => {
      if (searchTerm && !scan.storefront_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })

  const displayedScans = showAll ? filteredScans : filteredScans.slice(0, 5)

  // Get count of recent profitable scans
  const profitableScansCount = savedScans.filter(scan => 
    scan.status === 'completed' && scan.opportunities_found > 0
  ).length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-5 h-5 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">Recent Scans</h3>
            {!loading && profitableScansCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {profitableScansCount} profitable
              </span>
            )}
          </div>
          <ChevronDownIcon 
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          />
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="flex items-center justify-between mt-4 mb-4">
            <p className="text-sm text-gray-600">View and load previous scan results</p>
            <div className="flex items-center gap-3">
              <Link 
                href="/dashboard/recent-scans"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
              >
                View All Recent Scans
              </Link>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search scans..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : displayedScans.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No scans found</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {displayedScans.map((scan) => (
                  <div
                    key={scan.id}
                    className={`rounded-lg border p-3 transition-all ${
                      scan.status === 'completed' && scan.opportunities_found > 0
                        ? 'border-gray-200 hover:border-indigo-300 hover:shadow-sm cursor-pointer'
                        : 'border-gray-100 opacity-75'
                    }`}
                    onClick={() => scan.status === 'completed' && scan.opportunities_found > 0 && onLoadScan(scan.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">
                              {scan.storefront_name || 'All Storefronts'}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${getScanTypeColor(scan.scan_type)}`}>
                              {getScanTypeLabel(scan.scan_type)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span className="flex items-center gap-1">
                              {getStatusIcon(scan.status)}
                              {formatTimeAgo(scan.started_at)}
                            </span>
                            {scan.total_products > 0 && (
                              <span className="flex items-center gap-1">
                                <ShoppingBagIcon className="w-3 h-3" />
                                {scan.total_products}
                              </span>
                            )}
                            {scan.opportunities_found > 0 && (
                              <span className="flex items-center gap-1 text-green-600 font-medium">
                                <TrophyIcon className="w-3 h-3" />
                                {scan.opportunities_found}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Small integrated delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation() // Prevent scan click
                            handleDeleteScan(scan.id) // Delete immediately without confirmation
                          }}
                          disabled={deletingScanId === scan.id}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete scan and all opportunities"
                        >
                          {deletingScanId === scan.id ? (
                            <ArrowPathIcon className="w-3 h-3 animate-spin" />
                          ) : (
                            <TrashIcon className="w-3 h-3" />
                          )}
                        </button>
                        
                        {scan.status === 'completed' && scan.opportunities_found > 0 && (
                          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {filteredScans.length > 5 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  {showAll ? 'Show less' : `Show all (${filteredScans.length})`}
                </button>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}