'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  CalendarIcon,
  ShoppingBagIcon,
  TrophyIcon,
  FunnelIcon,
  MagnifyingGlassIcon
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

interface SavedScansPanelProps {
  onLoadScan: (scanId: string) => void
  onClose: () => void
}

export default function SavedScansPanel({ onLoadScan, onClose }: SavedScansPanelProps) {
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'opportunities' | 'products'>('date')

  useEffect(() => {
    fetchSavedScans()
  }, [])

  const fetchSavedScans = async () => {
    try {
      const { data, error } = await supabase
        .from('arbitrage_scans')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50)

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
        return 'Single Store'
      case 'all_storefronts':
        return 'All Stores'
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
        return <ArrowPathIcon className="w-4 h-4 animate-spin" />
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4" />
      case 'failed':
        return <XCircleIcon className="w-4 h-4" />
      default:
        return <ClockIcon className="w-4 h-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-700'
      case 'completed':
        return 'bg-green-100 text-green-700'
      case 'failed':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
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

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'In progress'
    const startDate = new Date(start)
    const endDate = new Date(end)
    const diffMs = endDate.getTime() - startDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffSecs = Math.floor((diffMs % 60000) / 1000)
    
    if (diffMins > 0) return `${diffMins}m ${diffSecs}s`
    return `${diffSecs}s`
  }

  const filteredScans = savedScans
    .filter(scan => {
      if (filterStatus !== 'all' && scan.status !== filterStatus) return false
      if (filterType !== 'all' && scan.scan_type !== filterType) return false
      if (searchTerm && !scan.storefront_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'opportunities':
          return (b.opportunities_found || 0) - (a.opportunities_found || 0)
        case 'products':
          return (b.total_products || 0) - (a.total_products || 0)
        case 'date':
        default:
          return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      }
    })

  const stats = {
    total: savedScans.length,
    completed: savedScans.filter(s => s.status === 'completed').length,
    totalOpportunities: savedScans.reduce((sum, s) => sum + (s.opportunities_found || 0), 0),
    avgOpportunities: savedScans.length > 0 
      ? Math.round(savedScans.reduce((sum, s) => sum + (s.opportunities_found || 0), 0) / savedScans.length)
      : 0
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-500 to-indigo-500 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Saved Scans History</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <XCircleIcon className="w-6 h-6" />
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/20 backdrop-blur rounded-lg p-3">
              <p className="text-violet-100 text-sm">Total Scans</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg p-3">
              <p className="text-violet-100 text-sm">Completed</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg p-3">
              <p className="text-violet-100 text-sm">Total Opportunities</p>
              <p className="text-2xl font-bold">{stats.totalOpportunities}</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg p-3">
              <p className="text-violet-100 text-sm">Avg per Scan</p>
              <p className="text-2xl font-bold">{stats.avgOpportunities}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by storefront name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="running">Running</option>
              <option value="failed">Failed</option>
            </select>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="single_storefront">Single Store</option>
              <option value="all_storefronts">All Stores</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="date">Latest First</option>
              <option value="opportunities">Most Opportunities</option>
              <option value="products">Most Products</option>
            </select>
          </div>
        </div>

        {/* Scans List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <ArrowPathIcon className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : filteredScans.length === 0 ? (
            <div className="text-center py-12">
              <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No scans found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredScans.map((scan) => (
                <div
                  key={scan.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => scan.status === 'completed' && scan.opportunities_found > 0 && onLoadScan(scan.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          {scan.storefront_name || 'All Storefronts'}
                        </h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${getScanTypeColor(scan.scan_type)}`}>
                          {getScanTypeLabel(scan.scan_type)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${getStatusColor(scan.status)}`}>
                          {getStatusIcon(scan.status)}
                          {scan.status.charAt(0).toUpperCase() + scan.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-6 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          <span>{formatTimeAgo(scan.started_at)}</span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          <span>{formatDuration(scan.started_at, scan.completed_at)}</span>
                        </div>
                        
                        {scan.total_products > 0 && (
                          <div className="flex items-center gap-1">
                            <ShoppingBagIcon className="w-4 h-4" />
                            <span>{scan.total_products} products</span>
                          </div>
                        )}
                        
                        {scan.opportunities_found > 0 && (
                          <div className="flex items-center gap-1 text-green-600 font-medium">
                            <TrophyIcon className="w-4 h-4" />
                            <span>{scan.opportunities_found} opportunities</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {scan.status === 'completed' && scan.opportunities_found > 0 && (
                      <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  
                  {/* Progress bar for running scans */}
                  {scan.status === 'running' && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}