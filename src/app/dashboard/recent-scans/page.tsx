'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { estimateMonthlySalesFromRank, formatSalesEstimate } from '@/lib/sales-estimator'
import { type ProfitCategory, getProfitCategoryColor, getProfitCategoryBgColor, getProfitCategoryBadgeColor, getProfitCategoryLabel, getProfitCategoryIcon } from '@/lib/profit-categorizer'
import { 
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronRightIcon,
  TrophyIcon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ChevronDownIcon,
  NoSymbolIcon
} from '@heroicons/react/24/outline'
import { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { useBlacklist } from '@/hooks/useBlacklist'
import SourcingListModal from '@/components/SourcingListModal'
import { StorefrontDisplay, formatStorefrontsText } from '@/lib/storefront-formatter'

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

interface EUMarketplacePrice {
  marketplace: string
  sourcePrice: number
  sourcePriceGBP: number
  profit: number
  profitMargin: number
  roi: number
  totalCost: number
}

interface PriceHistoryInfo {
  oldPrice?: number
  newPrice: number
  changeAmount?: number | null
  changePercentage?: number | null
  isFirstCheck: boolean
  lastChecked?: string
}

interface ArbitrageOpportunity {
  asin: string
  productName: string
  productImage: string
  targetPrice: number
  amazonFees: number
  referralFee: number
  fbaFee: number
  digitalServicesFee: number
  vatOnSale?: number
  netRevenue?: number
  ukCompetitors: number
  ukLowestPrice: number
  ukSalesRank: number
  salesPerMonth: number
  euPrices: EUMarketplacePrice[]
  bestOpportunity: EUMarketplacePrice
  profitCategory?: ProfitCategory
  storefronts?: Array<{
    id: string
    name: string
    seller_id: string
  }>
  priceHistory?: {
    uk: PriceHistoryInfo
    bestEu: PriceHistoryInfo & { marketplace: string }
  }
}

export default function RecentScansPage() {
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false)
  
  // Scan results viewing state
  const [viewingScan, setViewingScan] = useState<SavedScan | null>(null)
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([])
  const [loadingScanResults, setLoadingScanResults] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  
  // Blacklist functionality
  const { blacklistAsin, isLoading: isBlacklisting, error: blacklistError, success: blacklistSuccess, clearMessages } = useBlacklist()
  const [blacklistConfirm, setBlacklistConfirm] = useState<{ asin: string; productName: string } | null>(null)
  
  // Sorting and filtering state
  const [sortBy, setSortBy] = useState<'profit' | 'roi' | 'profitMargin' | 'targetPrice' | 'ukSalesRank'>('profit')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [minProfit, setMinProfit] = useState<number>(0)
  const [minROI, setMinROI] = useState<number>(0)
  const [maxPrice, setMaxPrice] = useState<number>(0)
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all')
  const [dealFilter, setDealFilter] = useState<'profitable' | 'profitable-breakeven' | 'all'>('profitable')
  
  // Delete functionality state
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null)
  
  // Sourcing list modal state
  const [showSourcingListModal, setShowSourcingListModal] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    checkAuth()
    fetchSavedScans()
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('Recent Scans - Auth check:', { user: user?.id, error })
      
      if (error) {
        console.error('Recent Scans - Auth error:', error)
        router.push('/')
        return
      }
      
      if (!user) {
        console.log('Recent Scans - No user found, redirecting to login')
        router.push('/')
        return
      }
      
      console.log('Recent Scans - User authenticated')
    } catch (error) {
      console.error('Recent Scans - Failed to check user:', error)
      router.push('/')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleBlacklistClick = (asin: string, productName: string) => {
    setBlacklistConfirm({ asin, productName })
  }

  const handleBlacklistConfirm = async () => {
    if (!blacklistConfirm) return
    
    const success = await blacklistAsin(blacklistConfirm.asin, 'Blacklisted from Recent Scans')
    if (success) {
      setBlacklistConfirm(null)
      // Optionally refresh the opportunities or remove the blacklisted item
      setTimeout(() => clearMessages(), 3000) // Clear success message after 3 seconds
    }
  }

  const handleBlacklistCancel = () => {
    setBlacklistConfirm(null)
    clearMessages()
  }

  const fetchSavedScans = async () => {
    try {
      const { data, error } = await supabase
        .from('arbitrage_scans')
        .select('*')
        .order('started_at', { ascending: false })

      if (!error && data) {
        setSavedScans(data)
      }
    } catch (error) {
      console.error('Error fetching saved scans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadRunningScan = async (scanId: string) => {
    console.log('handleLoadRunningScan called with:', scanId)
    setLoadingScanResults(true)
    setOpportunities([])
    setSelectedDeals(new Set())
    
    try {
      // Find the scan in our current data
      const scan = savedScans.find((s: any) => s.id === scanId)
      if (!scan) {
        throw new Error('Scan not found')
      }
      
      setViewingScan(scan)
      
      // Start polling for scan progress
      const pollScanProgress = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) throw new Error('No session')
          
          const response = await fetch(`/api/arbitrage/scan-progress/${scanId}`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          })
          
          if (!response.ok) {
            throw new Error('Failed to fetch scan progress')
          }
          
          const data = await response.json()
          const { scan: updatedScan, opportunities: fetchedOpportunities } = data
          
          // Update the scan in our list
          setSavedScans(prevScans => prevScans.map((s: any) => 
            s.id === scanId ? { ...s, ...updatedScan } : s
          ))
          
          // Update viewing scan
          setViewingScan((prev: any) => prev ? { ...prev, ...updatedScan } : null)
          
          // Update opportunities
          if (fetchedOpportunities && fetchedOpportunities.length > 0) {
            setOpportunities(fetchedOpportunities)
          }
          
          setLoadingScanResults(false)
          
          // Continue polling if still running
          if (updatedScan.status === 'running') {
            setTimeout(pollScanProgress, 5000) // Poll every 5 seconds
          } else if (updatedScan.status === 'completed') {
            // Fetch all opportunities once completed
            await handleLoadScan(scanId)
          }
        } catch (error) {
          console.error('Error polling scan progress:', error)
          setLoadingScanResults(false)
        }
      }
      
      // Start polling
      pollScanProgress()
      
    } catch (error) {
      console.error('Error loading running scan:', error)
      setLoadingScanResults(false)
    }
  }

  const handleLoadScan = async (scanId: string) => {
    console.log('handleLoadScan called with:', scanId)
    setLoadingScanResults(true)
    setOpportunities([])
    setSelectedDeals(new Set())
    
    try {
      // Find the scan in our current data
      const scan = savedScans.find((s: any) => s.id === scanId)
      if (!scan) {
        throw new Error('Scan not found')
      }
      
      console.log('Found scan:', scan)
      setViewingScan(scan)
      
      // Fetch opportunities for this scan
      console.log('Fetching opportunities for scan_id:', scanId)
      const { data: opportunities, error: oppsError } = await supabase
        .from('arbitrage_opportunities')
        .select('*')
        .eq('scan_id', scanId)
        .order('best_roi', { ascending: false })
      
      console.log('Opportunities data:', opportunities)
      console.log('Opportunities error:', oppsError)
      
      if (oppsError) {
        throw new Error('Failed to load opportunities')
      }
      
      // Transform the opportunities to match the expected format
      const transformedOpportunities: ArbitrageOpportunity[] = opportunities.map((opp: any) => ({
        asin: opp.asin,
        productName: opp.product_name || opp.asin,
        productImage: opp.product_image || '',
        targetPrice: parseFloat(opp.target_price || '0'),
        amazonFees: parseFloat(opp.amazon_fees || '0'),
        referralFee: parseFloat(opp.referral_fee || '0'),
        fbaFee: 0, // Not stored in DB
        digitalServicesFee: parseFloat(opp.digital_services_fee || '0'),
        ukCompetitors: opp.uk_competitors || 0,
        ukLowestPrice: parseFloat(opp.target_price || '0'), // Using target price as lowest
        ukSalesRank: opp.uk_sales_rank || 0,
        salesPerMonth: opp.sales_per_month || 0,
        euPrices: opp.all_marketplace_prices?.euPrices || [],
        bestOpportunity: {
          marketplace: opp.best_source_marketplace || 'EU',
          sourcePrice: parseFloat(opp.best_source_price || '0'),
          sourcePriceGBP: parseFloat(opp.best_source_price_gbp || '0'),
          profit: parseFloat(opp.best_profit || '0'),
          profitMargin: 0, // Calculate if needed
          roi: parseFloat(opp.best_roi || '0'),
          totalCost: parseFloat(opp.best_source_price_gbp || '0') + parseFloat(opp.amazon_fees || '0') + parseFloat(opp.digital_services_fee || '0')
        },
        storefronts: opp.storefronts || []
      }))
      
      console.log('Transformed opportunities:', transformedOpportunities)
      setOpportunities(transformedOpportunities)
      
      // Scroll to top of results
      window.scrollTo({ top: 0, behavior: 'smooth' })
      
    } catch (error) {
      console.error('Failed to load scan results:', error)
      alert('Failed to load scan results. Please try again.')
    } finally {
      setLoadingScanResults(false)
    }
  }

  const handleBackToScans = () => {
    setViewingScan(null)
    setOpportunities([])
    setSelectedDeals(new Set())
  }

  const getAmazonDomain = (marketplace: string) => {
    switch (marketplace) {
      case 'DE': return 'de'
      case 'FR': return 'fr'
      case 'IT': return 'it'
      case 'ES': return 'es'
      case 'NL': return 'nl'
      default: return 'de'
    }
  }

  const exportToCSV = () => {
    // Create CSV headers
    const headers = [
      'Scan ID',
      'Storefront Name',
      'Scan Type',
      'Status',
      'Started At',
      'Completed At',
      'Duration (minutes)',
      'Total Products',
      'Unique ASINs',
      'Opportunities Found',
      'Total Profit (£)',
      'Exchange Rate'
    ]

    // Convert scan data to CSV rows
    const csvRows = filteredScans.map((scan: any) => {
      const startedAt = new Date(scan.started_at)
      const completedAt = scan.completed_at ? new Date(scan.completed_at) : null
      const duration = completedAt 
        ? Math.round((completedAt.getTime() - startedAt.getTime()) / 60000)
        : null

      return [
        scan.id,
        scan.storefront_name || 'All Storefronts',
        getScanTypeLabel(scan.scan_type),
        scan.status.charAt(0).toUpperCase() + scan.status.slice(1),
        startedAt.toLocaleString('en-GB'),
        completedAt ? completedAt.toLocaleString('en-GB') : 'N/A',
        duration ? duration.toString() : 'N/A',
        scan.total_products,
        scan.unique_asins,
        scan.opportunities_found,
        scan.metadata?.total_profit ? scan.metadata.total_profit.toFixed(2) : 'N/A',
        scan.metadata?.exchange_rate ? scan.metadata.exchange_rate.toString() : 'N/A'
      ]
    })

    // Combine headers and data
    const csvContent = [headers, ...csvRows]
      .map((row: any) => row.map((field: any) => {
        // Escape fields that contain commas, quotes, or newlines
        const stringField = String(field)
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`
        }
        return stringField
      }).join(','))
      .join('\n')

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `recent-scans-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
      setSavedScans(prevScans => prevScans.filter((scan: any) => scan.id !== scanId))
      
      // If we're currently viewing this scan, go back to scan list
      if (viewingScan?.id === scanId) {
        handleBackToScans()
      }
      
    } catch (error) {
      console.error('Error deleting scan:', error)
    } finally {
      setDeletingScanId(null)
    }
  }


  const getScanTypeLabel = (type: string) => {
    switch (type) {
      case 'a2a_eu':
        return 'A2A EU'
      case 'single_storefront':
        return 'Single Storefront'
      case 'all_storefronts':
        return 'All Storefronts'
      case 'asin_check':
        return 'ASIN Checker'
      default:
        return type
    }
  }

  const getScanTypeColor = (type: string) => {
    switch (type) {
      case 'a2a_eu':
        return 'bg-violet-100 text-violet-700 border-violet-200'
      case 'single_storefront':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'all_storefronts':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'asin_check':
        return 'bg-amber-100 text-amber-700 border-amber-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircleIcon className="w-4 h-4 text-red-500" />
      default:
        return <ClockIcon className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const formatDateTime = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (started: string, completed: string | null) => {
    if (!completed) return 'In progress'
    
    const start = new Date(started)
    const end = new Date(completed)
    const diffMs = end.getTime() - start.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`
    return `${diffMins}m`
  }

  const getCountryFlag = (marketplace: string) => {
    const flags: { [key: string]: string } = {
      'DE': '🇩🇪',
      'FR': '🇫🇷',
      'IT': '🇮🇹',
      'ES': '🇪🇸'
    }
    return flags[marketplace] || marketplace
  }

  const filteredScans = savedScans
    .filter((scan: any) => {
      if (searchTerm && !scan.storefront_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
      if (filterStatus !== 'all' && scan.status !== filterStatus) return false
      if (filterType !== 'all' && scan.scan_type !== filterType) return false
      return true
    })

  // Group scans by date
  const groupedScans = filteredScans.reduce((groups: any, scan: any) => {
    const date = new Date(scan.started_at).toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    })
    if (!groups[date]) groups[date] = []
    groups[date].push(scan)
    return groups
  }, {} as Record<string, SavedScan[]>)

  // Statistics
  const totalScans = savedScans.length
  const completedScans = savedScans.filter((s: any) => s.status === 'completed').length
  const profitableScans = savedScans.filter((s: any) => s.status === 'completed' && s.opportunities_found > 0).length
  const totalOpportunities = savedScans.reduce((sum: any, s: any) => sum + (s.opportunities_found || 0), 0)

  // Function to filter and sort opportunities
  const getFilteredAndSortedOpportunities = () => {
    let filtered = opportunities.filter((opp: any) => {
      // Filter by deal type (profitable, break-even, or all)
      const profit = opp.bestOpportunity?.profit || 0;
      switch (dealFilter) {
        case 'profitable':
          if (profit <= 0.50) return false;
          break;
        case 'profitable-breakeven':
          if (profit < -0.50) return false;
          break;
        case 'all':
          // Show all deals
          break;
      }
      
      // Filter by minimum profit
      if (minProfit > 0 && opp.bestOpportunity.profit < minProfit) return false
      
      // Filter by minimum ROI
      if (minROI > 0 && opp.bestOpportunity.roi < minROI) return false
      
      // Filter by maximum UK price
      if (maxPrice > 0 && opp.targetPrice > maxPrice) return false
      
      // Filter by source marketplace
      if (selectedMarketplace !== 'all' && opp.bestOpportunity.marketplace !== selectedMarketplace) return false
      
      return true
    })

    // Sort the filtered results
    filtered.sort((a, b) => {
      let aValue: number
      let bValue: number

      switch (sortBy) {
        case 'profit':
          aValue = a.bestOpportunity.profit
          bValue = b.bestOpportunity.profit
          break
        case 'roi':
          aValue = a.bestOpportunity.roi
          bValue = b.bestOpportunity.roi
          break
        case 'profitMargin':
          aValue = a.bestOpportunity.profitMargin || 0
          bValue = b.bestOpportunity.profitMargin || 0
          break
        case 'targetPrice':
          aValue = a.targetPrice
          bValue = b.targetPrice
          break
        case 'ukSalesRank':
          aValue = a.ukSalesRank || 999999
          bValue = b.ukSalesRank || 999999
          break
        default:
          aValue = a.bestOpportunity.profit
          bValue = b.bestOpportunity.profit
      }

      if (sortOrder === 'asc') {
        return aValue - bValue
      } else {
        return bValue - aValue
      }
    })

    return filtered
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        onSignOut={handleSignOut} 
        onAddStorefront={() => setShowAddStorefrontModal(true)}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {viewingScan ? (
            // Scan Results View - Debug: {viewingScan.id}
            <>
              {/* Back Navigation */}
              <div className="mb-6">
                <button
                  onClick={handleBackToScans}
                  className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Recent Scans
                </button>
              </div>

              {/* Scan Results Header */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  <div className="w-full">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                      {viewingScan.scan_type === 'asin_check' 
                        ? 'ASIN Checker - Scan Results' 
                        : `${viewingScan.storefront_name || 'All Storefronts'} - Scan Results`}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Started: {formatDateTime(viewingScan.started_at)}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScanTypeColor(viewingScan.scan_type)}`}>
                        {getScanTypeLabel(viewingScan.scan_type)}
                      </span>
                      <span className="flex items-center gap-1">
                        <TrophyIcon className="w-4 h-4" />
                        {viewingScan.opportunities_found || 0} opportunities
                      </span>
                    </div>
                    
                    {/* Progress bar for running scans */}
                    {viewingScan.status === 'running' && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            {viewingScan.current_step || 'Processing...'}
                          </span>
                          <span className="text-sm font-medium text-blue-600">
                            {viewingScan.progress_percentage || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div 
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${viewingScan.progress_percentage || 0}%` }}
                          />
                        </div>
                        {viewingScan.processed_count > 0 && (
                          <p className="text-sm text-gray-600 mt-2">
                            Processed {viewingScan.processed_count} items
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Statistics Summary - Only for ASIN Checker scans */}
              {viewingScan.scan_type === 'asin_check' && opportunities.length > 0 && (
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl p-6 shadow-lg mb-6">
                  <h2 className="text-xl font-bold mb-4">
                    Statistics Summary
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                      <p className="text-violet-100 text-sm mb-1">Found Deals</p>
                      <p className="text-3xl font-bold">{opportunities.length}</p>
                      <p className="text-sm text-violet-200 mt-1">
                        {opportunities.filter((opp: any) => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length} profitable
                      </p>
                    </div>
                    <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                      <p className="text-violet-100 text-sm mb-1">Potential Profit</p>
                      <p className="text-3xl font-bold">
                        £{opportunities
                          .filter((opp: any) => opp.bestOpportunity && opp.bestOpportunity.profit > 0)
                          .reduce((sum: any, opp: any) => sum + (opp.bestOpportunity?.profit || 0), 0)
                          .toFixed(2)}
                      </p>
                      <p className="text-sm text-violet-200 mt-1">Total combined</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                      <p className="text-violet-100 text-sm mb-1">Average ROI</p>
                      <p className="text-3xl font-bold">
                        {opportunities.filter((opp: any) => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length > 0
                          ? (opportunities
                              .filter((opp: any) => opp.bestOpportunity && opp.bestOpportunity.profit > 0)
                              .reduce((sum: any, opp: any) => sum + (opp.bestOpportunity?.roi || 0), 0) / 
                              opportunities.filter((opp: any) => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length
                            ).toFixed(1)
                          : '0.0'}%
                      </p>
                      <p className="text-sm text-violet-200 mt-1">Profitable deals only</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                      <p className="text-violet-100 text-sm mb-1">Exchange Rate</p>
                      <p className="text-3xl font-bold">€1 = £0.86</p>
                      <p className="text-sm text-violet-200 mt-1">EUR to GBP</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {loadingScanResults ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                    <p className="text-gray-600">Loading scan results...</p>
                  </div>
                </div>
              ) : opportunities.length === 0 ? (
                <div className="bg-yellow-50 rounded-xl p-8 text-center">
                  <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-yellow-800 mb-2">No opportunities found</h3>
                  <p className="text-yellow-600">This scan didn&apos;t find any profitable opportunities.</p>
                </div>
              ) : (
                // Opportunities Display (copied from A2A EU page)
                <div className="space-y-6">
                  {/* Actions Bar */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {getFilteredAndSortedOpportunities().length} Arbitrage Opportunities
                        </h3>
                        <p className="text-sm text-gray-600">
                          Profitable deals found in this scan
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {selectedDeals.size > 0 && (
                          <>
                            <span className="text-sm text-gray-600">
                              {selectedDeals.size} selected
                            </span>
                            <button
                              onClick={() => {
                                const selectedOpportunities = opportunities.filter((opp: any) => selectedDeals.has(opp.asin))
                                if (selectedOpportunities.length > 0) {
                                  setShowSourcingListModal(true)
                                }
                              }}
                              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add to List
                            </button>
                            <button
                              onClick={() => {
                                const selectedOpportunities = opportunities.filter((opp: any) => selectedDeals.has(opp.asin))
                                const bulkMessage = selectedOpportunities.map((opp: any) => 
                                  `${opp.productName} (${opp.asin}) - £${opp.bestOpportunity.profit.toFixed(2)} profit - ${opp.bestOpportunity.roi.toFixed(1)}% ROI\\n` +
                                  `Buy: https://www.amazon.${getAmazonDomain(opp.bestOpportunity.marketplace)}/dp/${opp.asin}\\n` +
                                  `Sell: https://www.amazon.co.uk/dp/${opp.asin}\\n`
                                ).join('\\n---\\n\\n')
                                
                                window.open(`https://wa.me/?text=${encodeURIComponent(bulkMessage)}`, '_blank');
                              }}
                              className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                              </svg>
                              Share Selected
                            </button>
                            <button
                              onClick={() => setSelectedDeals(new Set())}
                              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sorting and Filtering Controls */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
                      {/* Deal Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Show Deals</label>
                        <Listbox value={dealFilter} onChange={setDealFilter}>
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                              <span className="block truncate text-sm">
                                {dealFilter === 'profitable' && '✅ Profitable'}
                                {dealFilter === 'profitable-breakeven' && '⚖️ + Break-Even'}
                                {dealFilter === 'all' && '📊 All Deals'}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronDownIcon
                                  className="h-5 w-5 text-gray-400"
                                  aria-hidden="true"
                                />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-50">
                                <Listbox.Option
                                  value="profitable"
                                  className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-4 pr-4 ${
                                      active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                    }`
                                  }
                                >
                                  <span className="block truncate font-normal">
                                    ✅ Profitable Only
                                  </span>
                                </Listbox.Option>
                                <Listbox.Option
                                  value="profitable-breakeven"
                                  className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-4 pr-4 ${
                                      active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                    }`
                                  }
                                >
                                  <span className="block truncate font-normal">
                                    ⚖️ Include Break-Even
                                  </span>
                                </Listbox.Option>
                                <Listbox.Option
                                  value="all"
                                  className={({ active }) =>
                                    `relative cursor-default select-none py-2 pl-4 pr-4 ${
                                      active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                    }`
                                  }
                                >
                                  <span className="block truncate font-normal">
                                    📊 Show All Deals
                                  </span>
                                </Listbox.Option>
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      {/* Sort By */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Sort by</label>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="profit">Profit (£)</option>
                          <option value="roi">ROI (%)</option>
                          <option value="profitMargin">Profit Margin (%)</option>
                          <option value="targetPrice">UK Price (£)</option>
                          <option value="ukSalesRank">Sales Rank</option>
                        </select>
                      </div>

                      {/* Sort Order */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                        <select
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="desc">High to Low</option>
                          <option value="asc">Low to High</option>
                        </select>
                      </div>

                      {/* Min Profit Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Min Profit (£)</label>
                        <input
                          type="number"
                          value={minProfit}
                          onChange={(e) => setMinProfit(Number(e.target.value))}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>

                      {/* Min ROI Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Min ROI (%)</label>
                        <input
                          type="number"
                          value={minROI}
                          onChange={(e) => setMinROI(Number(e.target.value))}
                          placeholder="0"
                          min="0"
                          step="0.1"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>

                      {/* Max Price Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Max UK Price (£)</label>
                        <input
                          type="number"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(Number(e.target.value))}
                          placeholder="No limit"
                          min="0"
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>

                      {/* Marketplace Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Source Market</label>
                        <select
                          value={selectedMarketplace}
                          onChange={(e) => setSelectedMarketplace(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="all">All Markets</option>
                          <option value="DE">Germany</option>
                          <option value="FR">France</option>
                          <option value="IT">Italy</option>
                          <option value="ES">Spain</option>
                        </select>
                      </div>
                    </div>

                    {/* Clear Filters Button */}
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => {
                          setMinProfit(0)
                          setMinROI(0)
                          setMaxPrice(0)
                          setSelectedMarketplace('all')
                          setDealFilter('profitable')
                          setSortBy('profit')
                          setSortOrder('desc')
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  </div>

                  {/* Opportunities List */}
                  {getFilteredAndSortedOpportunities().map((opp: any, index: any) => {
                    const isProfitable = opp.bestOpportunity?.profit > 0;
                    
                    return (
                      <div key={opp.asin} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow relative">
                        {/* Selection Checkbox */}
                        {isProfitable && (
                          <div className="absolute top-4 left-4 z-10">
                            <input
                              type="checkbox"
                              checked={selectedDeals.has(opp.asin)}
                              onChange={(e) => {
                                const newSelected = new Set(selectedDeals);
                                if (e.target.checked) {
                                  newSelected.add(opp.asin);
                                } else {
                                  newSelected.delete(opp.asin);
                                }
                                setSelectedDeals(newSelected);
                              }}
                              className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        )}
                        
                        <div className="p-6">
                          <div className="flex items-start gap-6">
                            {/* Left: Product Info with Ranking Badge */}
                            <div className="flex items-start gap-4 flex-1">
                              <div className="relative">
                                <div className="absolute -top-2 -left-2 w-12 h-12 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                                  #{index + 1}
                                </div>
                                <div className="w-28 h-28 bg-gray-100 rounded-xl flex items-center justify-center">
                                  {opp.productImage ? (
                                    <img src={opp.productImage} alt={opp.productName} className="w-full h-full object-contain rounded-xl" />
                                  ) : (
                                    <span className="text-gray-400 text-xs">No image</span>
                                  )}
                                </div>
                              </div>
                            
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-900 text-lg line-clamp-2 mb-2">{opp.productName}</h3>
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                  <span>{opp.asin}</span>
                                  <StorefrontDisplay storefronts={opp.storefronts} />
                                </div>
                                
                                {/* Sales and Rank Info */}
                                <div className="flex items-center gap-4 mt-2 mb-2">
                                  {opp.ukSalesRank > 0 && (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-600 font-medium">Rank:</span>
                                        <span className="text-sm font-semibold text-gray-900">#{opp.ukSalesRank.toLocaleString()}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-gray-600 font-medium">Sales/month:</span>
                                        <span className="text-sm font-semibold text-green-600">
                                          {opp.salesPerMonth > 0 
                                            ? opp.salesPerMonth.toLocaleString()
                                            : opp.ukSalesRank > 0 
                                              ? `~${formatSalesEstimate(estimateMonthlySalesFromRank(opp.ukSalesRank))}`
                                              : 'No data'
                                          }
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                <div className="flex gap-6 mt-2">
                                  <a
                                    href={`https://www.amazon.co.uk/dp/${opp.asin}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                                    </svg>
                                    View on Amazon UK
                                  </a>
                                  <a
                                    href={`https://keepa.com/#!product/1-${opp.asin}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-600 hover:underline text-sm flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                                    </svg>
                                    Keepa Charts
                                  </a>
                                  <a
                                    href={`https://sas.selleramp.com/sas/lookup/?searchterm=${opp.asin}&sas_cost_price=${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}&sas_sale_price=${(opp.targetPrice || 0).toFixed(2)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-600 hover:underline text-sm flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                    SAS
                                  </a>
                                </div>
                              </div>
                            </div>

                            {/* Right: Profit Info */}
                            <div className="text-right">
                              <p className="text-sm text-gray-500 mb-1">NET PROFIT (INC-VAT)</p>
                              <p className={`text-4xl font-bold ${getProfitCategoryColor(opp.profitCategory || 'profitable')}`}>
                                £{(opp.bestOpportunity?.profit || 0).toFixed(2)}
                              </p>
                              <div className="flex items-center justify-end gap-1 mt-2">
                                <span className={getProfitCategoryColor(opp.profitCategory || 'profitable')}>
                                  {getProfitCategoryIcon(opp.profitCategory || 'profitable')}
                                </span>
                                <span className={`font-medium ${getProfitCategoryColor(opp.profitCategory || 'profitable')}`}>
                                  {getProfitCategoryLabel(opp.profitCategory || 'profitable')}
                                </span>
                              </div>
                              <div className="flex gap-8 mt-4 text-sm">
                                <div>
                                  <p className="text-gray-500">Margin</p>
                                  <p className={`font-semibold ${getProfitCategoryColor(opp.profitCategory || 'profitable')}`}>
                                    {((opp.bestOpportunity?.profit / opp.targetPrice) * 100).toFixed(1)}%
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500">ROI</p>
                                  <p className={`font-semibold ${getProfitCategoryColor(opp.profitCategory || 'profitable')}`}>
                                    {(opp.bestOpportunity?.roi || 0).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="mt-3 flex gap-2 justify-end">
                                {/* Debug Button */}
                                <button
                                  onClick={() => {
                                    const debugWindow = window.open('', '_blank', 'width=650,height=800,scrollbars=yes,resizable=yes');
                                    if (debugWindow) {
                                      const sellingPrice = opp.targetPrice || 0;
                                      const totalAmazonFees = opp.amazonFees || 0;
                                      const referralFee = opp.referralFee || 0;
                                      const fbaFee = opp.fbaFee || 0;
                                      const digitalServicesFee = opp.digitalServicesFee || 0;
                                      const vatOnSale = opp.vatOnSale || (sellingPrice / 1.20 * 0.20);
                                      const netRevenue = opp.netRevenue || (sellingPrice - vatOnSale);
                                      const costOfGoods = opp.bestOpportunity?.sourcePriceGBP || 0;
                                      
                                      const totalCosts = costOfGoods + totalAmazonFees + digitalServicesFee;
                                      const profit = netRevenue - totalCosts;
                                      
                                      const displayReferralFee = referralFee;
                                      const displayFbaFee = fbaFee;
                                      const displayDigitalServicesFee = digitalServicesFee;
                                      const otherAmazonFees = Math.max(0, totalAmazonFees - referralFee - fbaFee);
                                      
                                      const EUR_TO_GBP_RATE = 0.86;
                                      
                                      debugWindow.document.write(`
                                        <!DOCTYPE html>
                                        <html>
                                          <head>
                                            <title>Debug: ${opp.productName}</title>
                                            <style>
                                              body { 
                                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                                                padding: 20px; 
                                                line-height: 1.6; 
                                                background: #f9fafb;
                                              }
                                              .container { 
                                                max-width: 500px; 
                                                margin: 0 auto; 
                                                background: white; 
                                                padding: 24px; 
                                                border-radius: 12px; 
                                                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                                              }
                                              .header { 
                                                text-align: center; 
                                                margin-bottom: 24px; 
                                                padding-bottom: 16px; 
                                                border-bottom: 2px solid #f59e0b;
                                              }
                                              .title { 
                                                color: #dc2626; 
                                                font-size: 20px; 
                                                font-weight: bold; 
                                                margin-bottom: 8px;
                                              }
                                              .asin { 
                                                color: #6b7280; 
                                                font-size: 14px; 
                                              }
                                              .breakdown { 
                                                margin: 20px 0; 
                                              }
                                              .calculation-row { 
                                                display: flex; 
                                                justify-content: space-between; 
                                                padding: 8px 0; 
                                                border-bottom: 1px solid #e5e7eb;
                                              }
                                              .calculation-row:last-child { 
                                                border-bottom: none; 
                                                font-weight: bold; 
                                                font-size: 18px; 
                                                padding-top: 16px; 
                                                border-top: 2px solid #374151;
                                              }
                                              .label { 
                                                color: #374151; 
                                              }
                                              .value { 
                                                font-weight: 600; 
                                              }
                                              .positive { 
                                                color: #059669; 
                                              }
                                              .negative { 
                                                color: #dc2626; 
                                              }
                                              .neutral { 
                                                color: #374151; 
                                              }
                                              .formula { 
                                                background: #f3f4f6; 
                                                padding: 16px; 
                                                border-radius: 8px; 
                                                margin: 16px 0; 
                                                font-family: monospace; 
                                                font-size: 14px; 
                                                color: #374151;
                                              }
                                              .note { 
                                                background: #fef3c7; 
                                                border: 1px solid #f59e0b; 
                                                padding: 12px; 
                                                border-radius: 6px; 
                                                font-size: 13px; 
                                                color: #92400e; 
                                                margin-top: 16px;
                                              }
                                            </style>
                                          </head>
                                          <body>
                                            <div class="container">
                                              <div class="header">
                                                <div class="title">🔍 Fee Breakdown Debug</div>
                                                <div class="asin">ASIN: ${opp.asin}</div>
                                              </div>
                                              
                                              <h3 style="color: #374151; margin-bottom: 16px;">📦 ${opp.productName}</h3>
                                              
                                              <div class="breakdown">
                                                <div class="calculation-row">
                                                  <span class="label">UK Selling Price:</span>
                                                  <span class="value neutral">£${sellingPrice.toFixed(2)}</span>
                                                </div>
                                                
                                                <div class="calculation-row">
                                                  <span class="label">Cost of Goods (${opp.bestOpportunity?.marketplace || 'EU'}):</span>
                                                  <span class="value negative">-£${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}</span>
                                                </div>
                                              </div>
                                              
                                              <!-- Amazon Fees Detailed Breakdown -->
                                              <div style="margin: 20px 0;">
                                                <h4 style="color: #dc2626; margin-bottom: 12px; font-weight: bold;">🏪 Amazon Fee Breakdown</h4>
                                                <div class="breakdown" style="background: #fef2f2; padding: 16px; border-radius: 8px; border: 1px solid #fecaca;">
                                                  ${displayReferralFee > 0 ? `
                                                  <div class="calculation-row">
                                                    <span class="label">Referral Fee:</span>
                                                    <span class="value negative">-£${displayReferralFee.toFixed(2)}</span>
                                                  </div>` : ''}
                                                  
                                                  ${displayFbaFee > 0 ? `
                                                  <div class="calculation-row">
                                                    <span class="label">FBA Fee:</span>
                                                    <span class="value negative">-£${displayFbaFee.toFixed(2)}</span>
                                                  </div>` : ''}
                                                  
                                                  ${otherAmazonFees > 0 ? `
                                                  <div class="calculation-row">
                                                    <span class="label">Other Amazon Fees:</span>
                                                    <span class="value negative">-£${otherAmazonFees.toFixed(2)}</span>
                                                  </div>` : ''}
                                                  
                                                  <div class="calculation-row" style="border-top: 2px solid #dc2626; padding-top: 8px; font-weight: bold; margin-top: 8px;">
                                                    <span class="label">Total Amazon Fees:</span>
                                                    <span class="value negative">-£${totalAmazonFees.toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              </div>
                                              
                                              <div class="breakdown">
                                                ${displayDigitalServicesFee > 0 ? `
                                                <div class="calculation-row">
                                                  <span class="label">Digital Services Fee:</span>
                                                  <span class="value negative">-£${displayDigitalServicesFee.toFixed(2)}</span>
                                                </div>` : ''}
                                              </div>
                                              
                                              <!-- VAT Breakdown -->
                                              <div style="margin: 20px 0;">
                                                <h4 style="color: #1e40af; margin-bottom: 12px; font-weight: bold;">💷 VAT Calculation</h4>
                                                <div class="breakdown" style="background: #eff6ff; padding: 16px; border-radius: 8px; border: 1px solid #bfdbfe;">
                                                  <div class="calculation-row">
                                                    <span class="label">Sale Price (inc VAT):</span>
                                                    <span class="value neutral">£${sellingPrice.toFixed(2)}</span>
                                                  </div>
                                                  <div class="calculation-row">
                                                    <span class="label">VAT on Sale (20%):</span>
                                                    <span class="value negative">-£${vatOnSale.toFixed(2)}</span>
                                                  </div>
                                                  <div class="calculation-row" style="border-top: 2px solid #3b82f6; padding-top: 8px; font-weight: bold;">
                                                    <span class="label">Net Revenue (ex VAT):</span>
                                                    <span class="value neutral">£${netRevenue.toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              </div>
                                              
                                              <div class="breakdown">
                                                <div class="calculation-row">
                                                  <span class="label">Net Profit:</span>
                                                  <span class="value ${profit > 0 ? 'positive' : 'negative'}">£${profit.toFixed(2)}</span>
                                                </div>
                                              </div>
                                              
                                              <div class="formula">
                                                <strong>Profit Calculation Formula:</strong><br>
                                                Net Profit = Net Revenue - Total Costs<br>
                                                Net Profit = (Sale Price - VAT) - (Cost of Goods + Amazon Fees + Digital Services Fee)<br><br>
                                                £${profit.toFixed(2)} = £${netRevenue.toFixed(2)} - (£${costOfGoods.toFixed(2)} + £${totalAmazonFees.toFixed(2)}${displayDigitalServicesFee > 0 ? ` + £${displayDigitalServicesFee.toFixed(2)}` : ''})<br><br>
                                                <strong>Detailed Breakdown:</strong><br>
                                                Sale Price (inc VAT): £${sellingPrice.toFixed(2)}<br>
                                                Less VAT (20%): -£${vatOnSale.toFixed(2)}<br>
                                                = Net Revenue: £${netRevenue.toFixed(2)}<br><br>
                                                Less Cost of Goods: -£${costOfGoods.toFixed(2)}<br>
                                                Less Amazon Fees: -£${totalAmazonFees.toFixed(2)}<br>
                                                ${displayDigitalServicesFee > 0 ? `Less Digital Services: -£${displayDigitalServicesFee.toFixed(2)}<br>` : ''}
                                                = Net Profit: £${profit.toFixed(2)}
                                              </div>
                                              
                                              <div style="margin-top: 20px;">
                                                <h4 style="color: #374151; margin-bottom: 12px;">📊 Performance Metrics</h4>
                                                <div class="calculation-row">
                                                  <span class="label">ROI:</span>
                                                  <span class="value ${(opp.bestOpportunity?.roi || 0) > 0 ? 'positive' : 'negative'}">${(opp.bestOpportunity?.roi || 0).toFixed(1)}%</span>
                                                </div>
                                                <div class="calculation-row">
                                                  <span class="label">Profit Margin:</span>
                                                  <span class="value ${profit > 0 ? 'positive' : 'negative'}">${((profit / (opp.targetPrice || 1)) * 100).toFixed(1)}%</span>
                                                </div>
                                                <div class="calculation-row">
                                                  <span class="label">Exchange Rate (EUR→GBP):</span>
                                                  <span class="value neutral">€1 = £${EUR_TO_GBP_RATE}</span>
                                                </div>
                                              </div>
                                              
                                              
                                              <div style="text-align: center; margin-top: 20px;">
                                                <button onclick="window.close()" style="
                                                  background: #6366f1; 
                                                  color: white; 
                                                  border: none; 
                                                  padding: 10px 20px; 
                                                  border-radius: 6px; 
                                                  cursor: pointer; 
                                                  font-weight: 600;
                                                ">Close Window</button>
                                              </div>
                                            </div>
                                          </body>
                                        </html>
                                      `);
                                      debugWindow.document.close();
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-1"
                                >
                                  🔍 Debug
                                </button>
                                
                                {/* Add to List Button */}
                                <button
                                  onClick={() => {
                                    const profitableOpps = getFilteredAndSortedOpportunities().filter((o: any) => o.bestOpportunity?.profit > 0)
                                    if (profitableOpps.length === 0) return
                                    
                                    // Set the current opportunity as selected and open modal
                                    setSelectedDeals(new Set([opp.asin]))
                                    setShowSourcingListModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  Add to List
                                </button>

                                {/* WhatsApp Share Button */}
                                <button
                                  onClick={() => {
                                    const storefrontInfo = formatStorefrontsText(opp.storefronts);
                                    const message = encodeURIComponent(
                                      `🎯 **Luca is the best Deal**\n\n` +
                                      `🛍️ **${opp.productName}** (${opp.asin})\n` +
                                      (storefrontInfo ? `🏪 **${storefrontInfo}**\n` : '') +
                                      `💰 **Profit: £${(opp.bestOpportunity?.profit || 0).toFixed(2)}** (${(opp.bestOpportunity?.roi || 0).toFixed(1)}% ROI)\n\n` +
                                      `📍 Buy: Amazon ${opp.bestOpportunity?.marketplace || 'EU'} - £${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}\n` +
                                      `🇬🇧 Sell: Amazon UK - £${(opp.targetPrice || 0).toFixed(2)}\n\n` +
                                      `🔗 [${opp.bestOpportunity?.marketplace || 'EU'} Link](${`https://www.amazon.${getAmazonDomain(opp.bestOpportunity?.marketplace || 'DE')}/dp/${opp.asin}`}) | [UK Link](${`https://www.amazon.co.uk/dp/${opp.asin}`})`
                                    );
                                    window.open(`https://wa.me/?text=${message}`, '_blank');
                                  }}
                                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                  </svg>
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </button>

                                {/* Telegram Share Button */}
                                <button
                                  onClick={async () => {
                                    const storefrontInfo = formatStorefrontsText(opp.storefronts);
                                    const message = 
                                      `🎯 *Luca is the best Deal*\n\n` +
                                      `🛍️ *${opp.productName}* (${opp.asin})\n` +
                                      (storefrontInfo ? `🏪 *${storefrontInfo}*\n` : '') +
                                      `💰 *Profit: £${(opp.bestOpportunity?.profit || 0).toFixed(2)}* (${(opp.bestOpportunity?.roi || 0).toFixed(1)}% ROI)\n\n` +
                                      `📍 Buy: Amazon ${opp.bestOpportunity?.marketplace || 'EU'} - £${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}\n` +
                                      `🇬🇧 Sell: Amazon UK - £${(opp.targetPrice || 0).toFixed(2)}\n\n` +
                                      `🔗 [${opp.bestOpportunity?.marketplace || 'EU'} Link](https://www.amazon.${getAmazonDomain(opp.bestOpportunity?.marketplace || 'DE')}/dp/${opp.asin}) | [UK Link](https://www.amazon.co.uk/dp/${opp.asin})`;
                                    
                                    try {
                                      const { data: { session } } = await supabase.auth.getSession();
                                      const response = await fetch('/api/telegram/send-deal', {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': `Bearer ${session?.access_token}`
                                        },
                                        body: JSON.stringify({ message })
                                      });
                                      
                                      if (response.ok) {
                                        alert('Deal sent to Telegram successfully!');
                                      } else {
                                        const error = await response.json();
                                        alert(`Failed to send to Telegram: ${error.details || error.error}`);
                                      }
                                    } catch (error) {
                                      console.error('Error sending to Telegram:', error);
                                      alert('Failed to send to Telegram');
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.56c-.21 2.27-1.13 7.75-1.6 10.29-.2 1.08-.59 1.44-.97 1.47-.82.07-1.45-.54-2.24-.97-1.24-.78-1.95-1.24-3.16-1.99-1.39-.87-.49-1.34.31-2.12.21-.2 3.85-3.52 3.91-3.82.01-.04.01-.19-.07-.27-.09-.08-.22-.05-.31-.03-.13.03-2.18 1.39-6.16 4.08-.58.4-1.11.59-1.57.58-.52-.01-1.51-.29-2.24-.53-.9-.29-1.62-.45-1.56-.95.03-.26.39-.53 1.07-.8 4.18-1.82 6.97-3.02 8.37-3.6 3.99-1.65 4.81-1.94 5.35-1.95.12 0 .38.03.55.18.14.13.18.3.2.45-.01.06-.01.24-.02.38z"/>
                                  </svg>
                                  <span className="hidden sm:inline">Telegram</span>
                                </button>

                                {/* Blacklist Button */}
                                <button
                                  onClick={() => handleBlacklistClick(opp.asin, opp.productName)}
                                  disabled={isBlacklisting}
                                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-1 disabled:opacity-50"
                                  title="Blacklist this ASIN"
                                >
                                  {isBlacklisting ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  ) : (
                                    <NoSymbolIcon className="w-4 h-4" />
                                  )}
                                  Blacklist
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* UK Selling Price */}
                          <div className="mt-6 flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-500 mb-1">UK SELLING PRICE</p>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-2xl font-bold text-blue-600">£{(opp.targetPrice || 0).toFixed(2)}</p>
                                  {/* Price change indicator */}
                                  {opp.priceHistory?.uk && !opp.priceHistory.uk.isFirstCheck && opp.priceHistory.uk.changePercentage !== null && Math.abs(opp.priceHistory.uk.changePercentage) > 0.01 && (
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                                      opp.priceHistory.uk.changePercentage > 0 
                                        ? 'bg-red-100 text-red-700' 
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                      {opp.priceHistory.uk.changePercentage > 0 ? (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                        </svg>
                                      ) : (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </svg>
                                      )}
                                      {Math.abs(opp.priceHistory.uk.changePercentage).toFixed(1)}%
                                    </div>
                                  )}
                                  {opp.priceHistory?.uk && opp.priceHistory.uk.isFirstCheck && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                <a
                                  href={`https://www.amazon.co.uk/dp/${opp.asin}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <span>🇬🇧</span>
                                  View on UK
                                </a>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <p className="text-sm text-gray-500">Ex-VAT: £{((opp.targetPrice || 0) / 1.2).toFixed(2)}</p>
                                {opp.priceHistory?.uk && !opp.priceHistory.uk.isFirstCheck && opp.priceHistory.uk.oldPrice && (
                                  <p className="text-sm text-gray-500">
                                    Was: £{opp.priceHistory.uk.oldPrice.toFixed(2)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* All EU Marketplace Prices */}
                          {opp.euPrices && opp.euPrices.length > 0 && (
                            <div className="mt-6">
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <span className="text-blue-500">🇪🇺</span> ALL EU MARKETPLACES
                                <span className="text-sm font-normal text-gray-500">({opp.euPrices?.length || 0} MARKETS)</span>
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                {(opp.euPrices || []).map((euPrice: any, idx: any) => {
                                  const isProfitable = (euPrice.profit || 0) > 0;
                                  const isBest = euPrice.marketplace === opp.bestOpportunity?.marketplace;
                                  
                                  return (
                                    <div 
                                      key={euPrice.marketplace} 
                                      className={`relative rounded-xl p-4 border-2 transition-all ${
                                        isBest 
                                          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
                                          : isProfitable 
                                            ? 'bg-blue-50 border-blue-200 hover:border-blue-300' 
                                            : 'bg-gray-50 border-gray-200'
                                      }`}
                                    >
                                      {isBest && (
                                        <span className="absolute -top-3 left-4 px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">
                                          BEST DEAL
                                        </span>
                                      )}
                                      
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-2xl">{getCountryFlag(euPrice.marketplace)}</span>
                                          <div>
                                            <p className={`font-semibold text-lg ${
                                              isProfitable ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                              {isProfitable ? '+' : ''}£{(euPrice.profit || 0).toFixed(2)}
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <p className="text-sm text-gray-900">£{(euPrice.sourcePriceGBP || 0).toFixed(2)}</p>
                                              {/* Price change for best EU marketplace */}
                                              {isBest && opp.priceHistory?.bestEu && !opp.priceHistory.bestEu.isFirstCheck && 
                                               opp.priceHistory.bestEu.changePercentage !== null && Math.abs(opp.priceHistory.bestEu.changePercentage) > 0.01 && (
                                                <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                                                  opp.priceHistory.bestEu.changePercentage > 0 
                                                    ? 'bg-red-100 text-red-700' 
                                                    : 'bg-green-100 text-green-700'
                                                }`}>
                                                  {opp.priceHistory.bestEu.changePercentage > 0 ? '↑' : '↓'}
                                                  {Math.abs(opp.priceHistory.bestEu.changePercentage).toFixed(1)}%
                                                </div>
                                              )}
                                            </div>
                                            <p className="text-xs text-gray-500">€{(euPrice.sourcePrice || 0).toFixed(2)}</p>
                                          </div>
                                        </div>
                                        
                                        <a
                                          href={`https://www.amazon.${getAmazonDomain(euPrice.marketplace)}/dp/${opp.asin}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                                            isBest 
                                              ? 'bg-green-600 text-white hover:bg-green-700' 
                                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                          }`}
                                        >
                                          <span>🔗</span>
                                          Buy
                                        </a>
                                      </div>
                                      
                                      <div className="flex justify-between items-end">
                                        <div>
                                          <p className="text-xs text-gray-500">in_stock</p>
                                          <p className="text-xs text-gray-600 mt-1">
                                            Margin: {((euPrice.profit / opp.targetPrice) * 100).toFixed(1)}%
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className={`text-lg font-bold ${
                                            isProfitable ? 'text-green-600' : 'text-red-600'
                                          }`}>
                                            {(euPrice.roi || 0).toFixed(1)}%
                                          </p>
                                          <p className="text-xs text-gray-500">ROI</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Price History Summary */}
                          {opp.priceHistory && (!opp.priceHistory.uk.isFirstCheck || !opp.priceHistory.bestEu.isFirstCheck) && (
                            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                              <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Price History
                              </h5>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                {!opp.priceHistory.uk.isFirstCheck && opp.priceHistory.uk.oldPrice && (
                                  <div>
                                    <p className="text-gray-600">UK Price Change</p>
                                    <p className="font-medium">
                                      £{opp.priceHistory.uk.oldPrice.toFixed(2)} → £{opp.priceHistory.uk.newPrice.toFixed(2)}
                                      {opp.priceHistory.uk.changePercentage !== null && (
                                        <span className={`ml-1 ${opp.priceHistory.uk.changePercentage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          ({opp.priceHistory.uk.changePercentage > 0 ? '+' : ''}{opp.priceHistory.uk.changePercentage.toFixed(1)}%)
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                )}
                                {!opp.priceHistory.bestEu.isFirstCheck && opp.priceHistory.bestEu.oldPrice && (
                                  <div>
                                    <p className="text-gray-600">{getCountryFlag(opp.priceHistory.bestEu.marketplace)} Best EU Price Change</p>
                                    <p className="font-medium">
                                      €{opp.priceHistory.bestEu.oldPrice.toFixed(2)} → €{opp.priceHistory.bestEu.newPrice.toFixed(2)}
                                      {opp.priceHistory.bestEu.changePercentage !== null && (
                                        <span className={`ml-1 ${opp.priceHistory.bestEu.changePercentage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                          ({opp.priceHistory.bestEu.changePercentage > 0 ? '+' : ''}{opp.priceHistory.bestEu.changePercentage.toFixed(1)}%)
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            // Scan List View (original content)
            <>
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <ClockIcon className="w-8 h-8 text-indigo-600" />
                <h1 className="text-3xl font-bold text-gray-900">Recent Scans</h1>
              </div>
              <div className="flex items-center gap-3">
                {filteredScans.length > 0 && (
                  <span className="text-sm text-gray-500">
                    {filteredScans.length} scan{filteredScans.length === 1 ? '' : 's'} to export
                  </span>
                )}
                <button
                  onClick={exportToCSV}
                  disabled={filteredScans.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>
            <p className="text-gray-600">View and manage your arbitrage scan history</p>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Scans</p>
                  <p className="text-2xl font-bold text-gray-900">{totalScans}</p>
                </div>
                <ClockIcon className="w-8 h-8 text-gray-400" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{completedScans}</p>
                </div>
                <CheckCircleIcon className="w-8 h-8 text-green-400" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Profitable</p>
                  <p className="text-2xl font-bold text-violet-600">{profitableScans}</p>
                </div>
                <TrophyIcon className="w-8 h-8 text-violet-400" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Opportunities</p>
                  <p className="text-2xl font-bold text-indigo-600">{totalOpportunities}</p>
                </div>
                <ShoppingBagIcon className="w-8 h-8 text-indigo-400" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by storefront name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="a2a_eu">A2A EU</option>
                <option value="single_storefront">Single Storefront</option>
                <option value="all_storefronts">All Storefronts</option>
                <option value="asin_check">ASIN Checker</option>
              </select>
            </div>
          </div>

          {/* Scans List */}
          {Object.keys(groupedScans).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <ClockIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No scans found</h3>
              <p className="text-gray-500">
                {searchTerm || filterStatus !== 'all' || filterType !== 'all' 
                  ? 'Try adjusting your filters or search term'
                  : 'Start by running an arbitrage analysis to see your scan history here'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedScans).map(([date, scans]: any) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarIcon className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900">{date}</h3>
                    <div className="h-px flex-1 bg-gray-200"></div>
                  </div>
                  
                  <div className="space-y-3">
                    {scans.map((scan: any) => (
                      <div
                        key={scan.id}
                        className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all ${
                          (scan.status === 'completed' && scan.opportunities_found > 0) || scan.status === 'running'
                            ? 'hover:shadow-md hover:border-indigo-300 cursor-pointer'
                            : ''
                        }`}
                        onClick={() => {
                          if (scan.status === 'completed' && scan.opportunities_found > 0) {
                            console.log('Loading scan:', scan.id, 'with', scan.opportunities_found, 'opportunities')
                            handleLoadScan(scan.id)
                          } else if (scan.status === 'running') {
                            console.log('Loading running scan:', scan.id)
                            handleLoadRunningScan(scan.id)
                          } else {
                            console.log('Scan not clickable:', scan.status, scan.opportunities_found)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(scan.status)}
                              <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor(scan.status)}`}>
                                {scan.status.charAt(0).toUpperCase() + scan.status.slice(1)}
                              </span>
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <h4 className="font-semibold text-gray-900">
                                  {scan.storefront_name || 'All Storefronts'}
                                </h4>
                                <span className={`px-2 py-1 text-xs font-medium rounded border ${getScanTypeColor(scan.scan_type)}`}>
                                  {getScanTypeLabel(scan.scan_type)}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-6 text-sm text-gray-500">
                                <span>Started: {formatDateTime(scan.started_at)}</span>
                                {scan.completed_at && (
                                  <span>Duration: {formatDuration(scan.started_at, scan.completed_at)}</span>
                                )}
                                {scan.status === 'running' ? (
                                  <>
                                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                      {scan.progress_percentage || 0}% complete
                                    </span>
                                    {scan.processed_count > 0 && (
                                      <span className="text-sm text-gray-600">
                                        {scan.processed_count} ASINs processed
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {scan.total_products > 0 && (
                                      <span className="flex items-center gap-1">
                                        <ShoppingBagIcon className="w-4 h-4" />
                                        {scan.total_products} products
                                      </span>
                                    )}
                                    {scan.opportunities_found > 0 && (
                                      <span className="flex items-center gap-1 text-green-600 font-medium">
                                        <TrophyIcon className="w-4 h-4" />
                                        {scan.opportunities_found} opportunities
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {scan.metadata?.total_profit && (
                              <div className="text-right">
                                <p className="text-sm text-gray-500">Total Profit</p>
                                <p className="text-lg font-bold text-green-600">
                                  £{scan.metadata.total_profit.toFixed(2)}
                                </p>
                              </div>
                            )}
                            
                            {/* Small integrated delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation() // Prevent scan click
                                handleDeleteScan(scan.id) // Delete immediately without confirmation
                              }}
                              disabled={deletingScanId === scan.id}
                              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete scan and all opportunities"
                            >
                              {deletingScanId === scan.id ? (
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              ) : (
                                <TrashIcon className="w-4 h-4" />
                              )}
                            </button>
                            
                            {((scan.status === 'completed' && scan.opportunities_found > 0) || scan.status === 'running') && (
                              <>
                                {scan.status === 'running' && (
                                  <span className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full mr-2">
                                    View Live
                                  </span>
                                )}
                                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                              </>
                            )}
                          </div>
                        </div>

                        {scan.status === 'failed' && (
                          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2">
                              <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                              <span className="text-sm text-red-700 font-medium">Scan failed</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Blacklist Confirmation Dialog */}
      {blacklistConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <NoSymbolIcon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Blacklist ASIN</h3>
                <p className="text-sm text-gray-500">This will exclude it from all future scans</p>
              </div>
            </div>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">{blacklistConfirm.productName}</p>
              <p className="text-sm text-gray-600">ASIN: {blacklistConfirm.asin}</p>
            </div>

            {blacklistError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{blacklistError}</p>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleBlacklistCancel}
                disabled={isBlacklisting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBlacklistConfirm}
                disabled={isBlacklisting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isBlacklisting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Blacklist ASIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Messages */}
      {(blacklistSuccess || blacklistError) && !blacklistConfirm && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`p-4 rounded-lg shadow-lg ${blacklistSuccess ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              {blacklistSuccess ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              ) : (
                <XCircleIcon className="w-5 h-5 text-red-600" />
              )}
              <p className={`text-sm font-medium ${blacklistSuccess ? 'text-green-700' : 'text-red-700'}`}>
                {blacklistSuccess || blacklistError}
              </p>
            </div>
          </div>
        </div>
      )}

      <AddStorefrontModal
        isOpen={showAddStorefrontModal}
        onClose={() => setShowAddStorefrontModal(false)}
        onSuccess={() => {
          setShowAddStorefrontModal(false)
        }}
      />

      {/* Sourcing List Modal */}
      <SourcingListModal
        isOpen={showSourcingListModal}
        onClose={() => {
          setShowSourcingListModal(false)
          setSelectedDeals(new Set()) // Clear selection after closing modal
        }}
        selectedDeals={opportunities.filter((opp: any) => selectedDeals.has(opp.asin))}
        addedFrom="recent_scans"
      />

    </div>
  )
}