'use client'

import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import SavedScansPanel from '@/components/SavedScansPanel'
import SavedScansInline from '@/components/SavedScansInline'
import { estimateMonthlySalesFromRank, formatSalesEstimate } from '@/lib/sales-estimator'
import { type ProfitCategory, getProfitCategoryColor, getProfitCategoryBgColor, getProfitCategoryBadgeColor, getProfitCategoryLabel, getProfitCategoryIcon } from '@/lib/profit-categorizer'
import { 
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  SparklesIcon,
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  NoSymbolIcon
} from '@heroicons/react/24/outline'
import { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { useBlacklist } from '@/hooks/useBlacklist'

// Exchange rate constant
const EUR_TO_GBP_RATE = 0.86

interface Storefront {
  id: string
  name: string
  seller_id: string
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
  salesPerMonth?: number
  euPrices: EUMarketplacePrice[]
  bestOpportunity: EUMarketplacePrice
  profitCategory?: ProfitCategory
  storefronts?: Array<{
    id: string
    name: string
    seller_id: string
  }>
}

type SortOption = 'profit' | 'roi' | 'margin' | 'price'


type SelectionMode = 'single' | 'multiple' | 'all'

function A2AEUPageContent() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([])
  const [storefronts, setStorefronts] = useState<Storefront[]>([])
  const [selectedStorefront, setSelectedStorefront] = useState<Storefront | null>(null)
  const [selectedStorefronts, setSelectedStorefronts] = useState<Storefront[]>([])
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single')
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStats, setAnalysisStats] = useState<{
    totalOpportunities: number
    productsAnalyzed: number
    exchangeRate: number
    progressMessage?: string
    progress?: number
    estimatedMinutesRemaining?: number
    processedCount?: number
    totalProducts?: number
    // New fields for detailed All Sellers statistics
    storefrontsCount?: number
    uniqueAsins?: number
    excludedCount?: number
    blacklistedCount?: number
    finalAsinCount?: number
  } | null>(null)
  const [productCount, setProductCount] = useState<number>(0)
  const [syncingProducts, setSyncingProducts] = useState(false)
  const [dealFilter, setDealFilter] = useState<'profitable' | 'profitable-breakeven' | 'all'>('profitable')
  const [analyzingAllSellers, setAnalyzingAllSellers] = useState(false)
  const [analyzingSelectedStorefronts, setAnalyzingSelectedStorefronts] = useState(false)
  const [viewingSavedScan, setViewingSavedScan] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('profit')
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())

  // Blacklist functionality
  const { blacklistAsin, isLoading: isBlacklisting, error: blacklistError, success: blacklistSuccess, clearMessages } = useBlacklist()
  const [blacklistConfirm, setBlacklistConfirm] = useState<{ asin: string; productName: string } | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filter opportunities based on deal filter setting
  const getFilteredOpportunities = (opportunities: ArbitrageOpportunity[]) => {
    return opportunities.filter(opp => {
      const profit = opp.bestOpportunity?.profit || 0;
      
      switch (dealFilter) {
        case 'profitable':
          return profit > 0.50;
        case 'profitable-breakeven':
          return profit >= -0.50;
        case 'all':
          return true;
        default:
          return profit > 0.50;
      }
    });
  }

  useEffect(() => {
    checkAuth()
    
    // Check if there's a scanId in the URL parameters
    const scanId = searchParams.get('scanId')
    if (scanId) {
      loadScanResults(scanId)
    }
  }, [searchParams])
  
  useEffect(() => {
    if (selectionMode === 'single' && selectedStorefront) {
      fetchProductCount()
    } else if (selectionMode === 'multiple' && selectedStorefronts.length > 0) {
      fetchProductCount()
    } else if (selectionMode === 'all') {
      fetchProductCount()
    }
  }, [selectedStorefront, selectedStorefronts, selectionMode])


  const checkAuth = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('Auth check:', { user: user?.id, error })
      
      if (error) {
        console.error('Auth error:', error)
        router.push('/')
      } else if (!user) {
        console.log('No user found, redirecting to login')
        router.push('/')
      } else {
        console.log('User authenticated, fetching storefronts')
        fetchStorefronts()
      }
    } catch (error) {
      console.error('Error checking auth:', error)
      router.push('/')
    }
  }

  const fetchStorefronts = async () => {
    try {
      console.log('Fetching storefronts...')
      const { data, error } = await supabase
        .from('storefronts')
        .select('id, name, seller_id')
        .order('name')

      console.log('Storefronts query result:', { data, error })
      
      if (error) {
        console.error('Supabase error fetching storefronts:', error)
      } else if (data) {
        console.log(`Found ${data.length} storefronts`)
        setStorefronts(data)
        if (data.length > 0) {
          setSelectedStorefront(data[0])
          if (selectionMode === 'multiple' && selectedStorefronts.length === 0) {
            setSelectedStorefronts([data[0]])
          }
        }
      } else {
        console.log('No data returned from storefronts query')
      }
    } catch (error) {
      console.error('Error fetching storefronts:', error)
    } finally {
      setLoading(false)
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
    
    const success = await blacklistAsin(blacklistConfirm.asin, 'Blacklisted from Luca is the best Deals')
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

  const handleStorefrontToggle = (storefront: Storefront) => {
    setSelectedStorefronts(prev => {
      const isSelected = prev.some(s => s.id === storefront.id)
      if (isSelected) {
        return prev.filter(s => s.id !== storefront.id)
      } else {
        return [...prev, storefront]
      }
    })
  }

  const handleSelectAllStorefronts = () => {
    setSelectedStorefronts([...storefronts])
  }

  const handleClearAllStorefronts = () => {
    setSelectedStorefronts([])
  }

  const handleSelectionModeChange = (mode: SelectionMode) => {
    setSelectionMode(mode)
    setViewingSavedScan(null) // Clear any viewed scan
    
    // Initialize selections based on mode
    if (mode === 'single' && !selectedStorefront && storefronts.length > 0) {
      setSelectedStorefront(storefronts[0])
    } else if (mode === 'multiple' && selectedStorefronts.length === 0 && storefronts.length > 0) {
      setSelectedStorefronts([storefronts[0]]) // Start with first storefront selected
    }
  }

  
  const loadScanResults = async (scanId: string) => {
    setOpportunities([])
    setAnalysisStats(null)
    setViewingSavedScan(scanId)
    
    // Scroll to the beginning of the scan results
    window.scrollTo({ top: 0, behavior: 'smooth' })
    
    try {
      // Fetch scan details
      const { data: scan, error: scanError } = await supabase
        .from('arbitrage_scans')
        .select('*')
        .eq('id', scanId)
        .single()
      
      if (scanError || !scan) {
        throw new Error('Failed to load scan')
      }
      
      // Fetch opportunities for this scan
      const { data: opportunities, error: oppsError } = await supabase
        .from('arbitrage_opportunities')
        .select('*')
        .eq('scan_id', scanId)
        .order('best_roi', { ascending: false })
      
      if (oppsError) {
        throw new Error('Failed to load opportunities')
      }
      
      // Transform the opportunities to match the expected format
      const transformedOpportunities: ArbitrageOpportunity[] = opportunities.map(opp => ({
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
      
      setOpportunities(transformedOpportunities)
      
      // Set analysis stats from the scan
      setAnalysisStats({
        totalOpportunities: scan.opportunities_found || 0,
        productsAnalyzed: scan.total_products || 0,
        exchangeRate: scan.metadata?.exchange_rate || EUR_TO_GBP_RATE,
        progressMessage: `Loaded ${scan.opportunities_found || 0} opportunities from ${new Date(scan.started_at).toLocaleString('en-GB')}`,
        progress: 100
      })
      
    } catch (error: any) {
      console.error('Error loading scan results:', error)
      alert(`Failed to load scan results: ${error.message}`)
    }
  }
  
  const fetchProductCount = async () => {
    try {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      if (selectionMode === 'single' && selectedStorefront) {
        query = query.eq('storefront_id', selectedStorefront.id)
      } else if (selectionMode === 'multiple' && selectedStorefronts.length > 0) {
        query = query.in('storefront_id', selectedStorefronts.map(s => s.id))
      } else if (selectionMode === 'all') {
        // For all mode, get products from all user's storefronts
        const storefrontIds = storefronts.map(s => s.id)
        if (storefrontIds.length > 0) {
          query = query.in('storefront_id', storefrontIds)
        }
      } else {
        setProductCount(0)
        return
      }
      
      const { count } = await query
      setProductCount(count || 0)
    } catch (error) {
      console.error('Error fetching product count:', error)
      setProductCount(0)
    }
  }
  
  const syncProducts = async () => {
    if (!selectedStorefront) return
    
    setSyncingProducts(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/sync-storefront-keepa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storefrontId: selectedStorefront.id,
          sellerId: selectedStorefront.seller_id
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }
      
      alert(`Successfully synced ${data.productsAdded} products!`)
      await fetchProductCount()
      
    } catch (error: any) {
      console.error('Sync error:', error)
      alert(`Failed to sync products: ${error.message}`)
    } finally {
      setSyncingProducts(false)
    }
  }

  const analyzeAllSellers = async () => {
    setAnalyzingAllSellers(true)
    setOpportunities([])
    setAnalysisStats(null)
    setViewingSavedScan(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/arbitrage/analyze-all-sellers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to start analysis')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let opportunityCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const message = JSON.parse(line.slice(6))
              
              switch (message.type) {
                case 'progress':
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: message.data.productsAnalyzed || 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    ...prev,
                    progressMessage: message.data.step,
                    progress: message.data.progress,
                    estimatedMinutesRemaining: message.data.estimatedMinutesRemaining,
                    processedCount: message.data.processedCount,
                    totalProducts: message.data.totalProducts || message.data.finalAsinCount,
                    // New detailed statistics for All Sellers scan
                    storefrontsCount: message.data.storefrontsCount,
                    uniqueAsins: message.data.uniqueAsins,
                    excludedCount: message.data.excludedCount,
                    blacklistedCount: message.data.blacklistedCount,
                    finalAsinCount: message.data.finalAsinCount
                  }))
                  break
                  
                case 'opportunity':
                  opportunityCount++
                  setOpportunities(prev => {
                    const newOpportunities = [...prev, message.data]
                    // Sort by best ROI
                    return newOpportunities.sort((a, b) => b.bestOpportunity.roi - a.bestOpportunity.roi)
                  })
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: prev?.productsAnalyzed || 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: prev?.progressMessage,
                    progress: prev?.progress
                  }))
                  break
                  
                case 'complete':
                  setAnalysisStats(prev => ({
                    ...prev,
                    totalOpportunities: message.data.opportunitiesFound,
                    productsAnalyzed: message.data.totalProducts,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: message.data.message,
                    progress: 100
                  }))
                  break
                  
                case 'error':
                  console.error('Analysis error:', message.data.error)
                  alert(message.data.error)
                  setAnalyzingAllSellers(false)
                  // Update analysis stats to show error
                  setAnalysisStats({
                    totalOpportunities: 0,
                    productsAnalyzed: 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: `Error: ${message.data.error}`,
                    progress: 0
                  })
                  return // Exit the stream processing
              }
            } catch (parseError) {
              console.error('Error parsing message:', parseError)
            }
          }
        }
      }
      
    } catch (error: any) {
      console.error('Analysis error:', error)
      alert(`Failed to analyze all sellers: ${error.message}`)
    } finally {
      setAnalyzingAllSellers(false)
    }
  }

  const analyzeSelectedStorefronts = async () => {
    if (selectedStorefronts.length === 0) return
    
    setAnalyzingSelectedStorefronts(true)
    setOpportunities([])
    setAnalysisStats(null)
    setViewingSavedScan(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/arbitrage/analyze-selected-storefronts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storefrontIds: selectedStorefronts.map(s => s.id)
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to start analysis')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let opportunityCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const message = JSON.parse(line.slice(6))
              
              switch (message.type) {
                case 'progress':
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: message.data.productsAnalyzed || 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    ...prev,
                    progressMessage: message.data.step,
                    progress: message.data.progress,
                    estimatedMinutesRemaining: message.data.estimatedMinutesRemaining,
                    processedCount: message.data.processedCount,
                    totalProducts: message.data.totalProducts || message.data.finalAsinCount,
                    // Statistics for selected storefronts scan
                    storefrontsCount: message.data.storefrontsCount,
                    uniqueAsins: message.data.uniqueAsins,
                    excludedCount: message.data.excludedCount,
                    blacklistedCount: message.data.blacklistedCount,
                    finalAsinCount: message.data.finalAsinCount
                  }))
                  break
                  
                case 'opportunity':
                  opportunityCount++
                  setOpportunities(prev => {
                    const newOpportunities = [...prev, message.data]
                    // Sort by best ROI
                    return newOpportunities.sort((a, b) => b.bestOpportunity.roi - a.bestOpportunity.roi)
                  })
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: prev?.productsAnalyzed || 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: prev?.progressMessage,
                    progress: prev?.progress
                  }))
                  break
                  
                case 'complete':
                  setAnalysisStats(prev => ({
                    ...prev,
                    totalOpportunities: message.data.totalOpportunities,
                    productsAnalyzed: message.data.productsAnalyzed,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: `Analysis complete! Found ${message.data.totalOpportunities} opportunities from ${message.data.storefrontsCount} selected storefronts.`,
                    progress: 100
                  }))
                  break
                  
                case 'error':
                  console.error('Analysis error:', message.data.error)
                  alert(message.data.error)
                  setAnalyzingSelectedStorefronts(false)
                  // Update analysis stats to show error
                  setAnalysisStats({
                    totalOpportunities: 0,
                    productsAnalyzed: 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: `Error: ${message.data.error}`,
                    progress: 0
                  })
                  return // Exit the stream processing
              }
            } catch (parseError) {
              console.error('Error parsing message:', parseError)
            }
          }
        }
      }
      
    } catch (error: any) {
      console.error('Analysis error:', error)
      alert(`Failed to analyze selected storefronts: ${error.message}`)
    } finally {
      setAnalyzingSelectedStorefronts(false)
    }
  }

  const analyzeArbitrage = async () => {
    if (!selectedStorefront) return
    
    setAnalyzing(true)
    setOpportunities([])
    setAnalysisStats(null)
    setViewingSavedScan(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/arbitrage/analyze-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storefrontId: selectedStorefront.id
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to start analysis')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let opportunityCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const message = JSON.parse(line.slice(6))
              
              switch (message.type) {
                case 'progress':
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    ...prev,
                    progressMessage: message.data.step,
                    progress: message.data.progress,
                    estimatedMinutesRemaining: message.data.estimatedMinutesRemaining,
                    processedCount: message.data.processedCount,
                    totalProducts: message.data.totalProducts
                  }))
                  break
                  
                case 'opportunity':
                  opportunityCount++
                  setOpportunities(prev => {
                    const newOpportunities = [...prev, message.data]
                    // Sort by best ROI
                    return newOpportunities.sort((a, b) => b.bestOpportunity.roi - a.bestOpportunity.roi)
                  })
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: prev?.productsAnalyzed || 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: prev?.progressMessage,
                    progress: prev?.progress
                  }))
                  break
                  
                case 'complete':
                  setAnalysisStats(prev => ({
                    ...prev,
                    totalOpportunities: message.data.opportunitiesFound,
                    productsAnalyzed: message.data.totalProducts,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: message.data.message,
                    progress: 100
                  }))
                  break
                  
                case 'error':
                  console.error('Analysis error:', message.data.error)
                  
                  // Check if it's a critical error that should stop processing
                  const criticalErrors = ['No products found', 'Authentication required', 'Service temporarily unavailable']
                  const isCriticalError = criticalErrors.some(err => message.data.error.includes(err))
                  
                  if (isCriticalError) {
                    alert(message.data.error)
                    setAnalyzing(false)
                    // Update analysis stats to show error
                    setAnalysisStats({
                      totalOpportunities: 0,
                      productsAnalyzed: 0,
                      exchangeRate: EUR_TO_GBP_RATE,
                      progressMessage: `Error: ${message.data.error}`,
                      progress: 0
                    })
                    return // Exit the stream processing for critical errors
                  } else {
                    // For non-critical errors, just log and continue
                    console.warn('Non-critical error during analysis:', message.data.error)
                    // Optionally update the UI to show a warning
                    setAnalysisStats(prev => ({
                      totalOpportunities: prev?.totalOpportunities || 0,
                      productsAnalyzed: prev?.productsAnalyzed || 0,
                      exchangeRate: prev?.exchangeRate || EUR_TO_GBP_RATE,
                      ...prev,
                      progressMessage: `Warning: ${message.data.error} - Continuing analysis...`
                    }))
                  }
                  break
              }
            } catch (parseError) {
              console.error('Error parsing message:', parseError)
            }
          }
        }
      }
      
    } catch (error: any) {
      console.error('Analysis error:', error)
      alert(`Failed to analyze arbitrage opportunities: ${error.message}`)
    } finally {
      setAnalyzing(false)
    }
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
  
  const getAmazonDomain = (marketplace: string) => {
    const domains: { [key: string]: string } = {
      'DE': 'de',
      'FR': 'fr',
      'IT': 'it',
      'ES': 'es'
    }
    return domains[marketplace] || 'com'
  }

  // Calculate summary statistics
  const summaryStats = {
    totalDeals: opportunities.length,
    profitableDeals: opportunities.filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length,
    totalPotentialProfit: opportunities
      .filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0)
      .reduce((sum, opp) => sum + (opp.bestOpportunity?.profit || 0), 0),
    averageROI: opportunities.length > 0
      ? opportunities
          .filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0)
          .reduce((sum, opp) => sum + (opp.bestOpportunity?.roi || 0), 0) / 
          opportunities.filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length
      : 0
  }

  // Sort opportunities based on selected criteria
  const sortedOpportunities = [...opportunities].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        return (b.bestOpportunity?.profit || 0) - (a.bestOpportunity?.profit || 0)
      case 'roi':
        return (b.bestOpportunity?.roi || 0) - (a.bestOpportunity?.roi || 0)
      case 'margin':
        return (b.bestOpportunity?.profitMargin || 0) - (a.bestOpportunity?.profitMargin || 0)
      case 'price':
        return (a.targetPrice || 0) - (b.targetPrice || 0)
      default:
        return 0
    }
  })

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        onSignOut={handleSignOut} 
        onAddStorefront={() => setShowAddStorefrontModal(true)}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">A2A EU Deals</h1>
              <p className="text-gray-600">Find profitable Amazon UK to EU arbitrage opportunities</p>
            </div>
            <button
              onClick={() => {
                const recentScansElement = document.getElementById('recent-scans')
                if (recentScansElement) {
                  recentScansElement.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <ClockIcon className="w-4 h-4" />
              Recent Scans
            </button>
          </div>

          {/* Saved Scans Inline */}
          <div id="recent-scans">
            <SavedScansInline 
              onLoadScan={(scanId) => {
                loadScanResults(scanId)
              }}
            />
          </div>

          {/* Storefront Selector */}
          {!loading && storefronts.length > 0 && (
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Select Storefronts</h3>
                  <p className="text-sm text-gray-600">Choose storefronts to analyse deals</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {storefronts.length} storefront{storefronts.length > 1 ? 's' : ''} available
                  </span>
                </div>
              </div>

              {/* Mode Switcher */}
              <div className="mb-4">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                  <button
                    onClick={() => handleSelectionModeChange('single')}
                    className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                      selectionMode === 'single'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Single
                  </button>
                  <button
                    onClick={() => handleSelectionModeChange('multiple')}
                    className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                      selectionMode === 'multiple'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Multiple
                  </button>
                  <button
                    onClick={() => handleSelectionModeChange('all')}
                    className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                      selectionMode === 'all'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All
                  </button>
                </div>
              </div>

              {/* Single Storefront Selector */}
              {selectionMode === 'single' && (
                <Listbox value={selectedStorefront} onChange={setSelectedStorefront}>
                  <div className="relative">
                    <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-white py-4 pl-6 pr-12 text-left border-2 border-gray-200 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm">
                      {selectedStorefront ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="block font-semibold text-gray-900 text-lg">{selectedStorefront.name}</span>
                            <span className="block text-gray-500 text-sm mt-1">Seller ID: {selectedStorefront.seller_id}</span>
                          </div>
                          <div className="flex items-center gap-2 mr-8">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-sm text-gray-600">Active</span>
                          </div>
                        </div>
                      ) : (
                        <span className="block text-gray-500">Choose a storefront to start</span>
                      )}
                      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                        <div className="p-1 rounded-lg bg-gray-100">
                          <ChevronDownIcon className="h-5 w-5 text-gray-600" aria-hidden="true" />
                        </div>
                      </span>
                    </Listbox.Button>
                    <Transition
                      as={Fragment}
                      enter="transition ease-out duration-100"
                      enterFrom="transform opacity-0 scale-95"
                      enterTo="transform opacity-100 scale-100"
                      leave="transition ease-in duration-75"
                      leaveFrom="transform opacity-100 scale-100"
                      leaveTo="transform opacity-0 scale-95"
                    >
                      <Listbox.Options className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl bg-white py-2 text-base shadow-xl ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                        {storefronts.map((storefront) => (
                          <Listbox.Option
                            key={storefront.id}
                            className={({ active }) =>
                              `relative cursor-pointer select-none py-3 px-6 ${
                                active ? 'bg-gradient-to-r from-indigo-50 to-violet-50' : ''
                              }`
                            }
                            value={storefront}
                          >
                            {({ selected, active }) => (
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className={`block ${selected ? 'font-semibold text-indigo-900' : 'font-medium text-gray-900'}`}>
                                    {storefront.name}
                                  </span>
                                  <span className={`block text-sm ${active ? 'text-indigo-700' : 'text-gray-500'}`}>
                                    Seller ID: {storefront.seller_id}
                                  </span>
                                </div>
                                {selected && (
                                  <div className="flex items-center">
                                    <CheckCircleIcon className="h-5 w-5 text-indigo-600" />
                                  </div>
                                )}
                              </div>
                            )}
                          </Listbox.Option>
                        ))}
                      </Listbox.Options>
                    </Transition>
                  </div>
                </Listbox>
              )}

              {/* Multiple Storefront Selector */}
              {selectionMode === 'multiple' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {selectedStorefronts.length} of {storefronts.length} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAllStorefronts}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={handleClearAllStorefronts}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl border-2 border-gray-200 max-h-60 overflow-y-auto">
                    {storefronts.map((storefront) => {
                      const isSelected = selectedStorefronts.some(s => s.id === storefront.id)
                      return (
                        <div
                          key={storefront.id}
                          className="flex items-center gap-3 p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleStorefrontToggle(storefront)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStorefrontToggle(storefront)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{storefront.name}</div>
                            <div className="text-sm text-gray-500">Seller ID: {storefront.seller_id}</div>
                          </div>
                          {isSelected && (
                            <CheckCircleIcon className="w-5 h-5 text-indigo-600" />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* All Storefronts Mode */}
              {selectionMode === 'all' && (
                <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <UserGroupIcon className="w-6 h-6 text-indigo-600" />
                    <div>
                      <div className="font-medium text-gray-900">All Storefronts Selected</div>
                      <div className="text-sm text-gray-500">
                        Analysing all {storefronts.length} storefronts: {storefronts.map(s => s.name).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Product Count and Sync */}
              {(selectionMode === 'single' && selectedStorefront) || 
               (selectionMode === 'multiple' && selectedStorefronts.length > 0) || 
               selectionMode === 'all' ? (
                <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-lg border border-indigo-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <ShoppingBagIcon className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {productCount} Products
                        </p>
                        <p className="text-xs text-gray-600">
                          {selectionMode === 'single' && selectedStorefront && `From ${selectedStorefront.name}`}
                          {selectionMode === 'multiple' && `From ${selectedStorefronts.length} selected storefronts`}
                          {selectionMode === 'all' && `From all ${storefronts.length} storefronts`}
                        </p>
                      </div>
                    </div>
                    {selectionMode === 'single' && selectedStorefront && (
                      <button
                        onClick={syncProducts}
                        disabled={syncingProducts}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50"
                      >
                        {syncingProducts ? (
                          <>
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <ArrowPathIcon className="h-4 w-4" />
                            Sync Products
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {productCount === 0 && selectionMode === 'single' && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-xs text-amber-800 flex items-start gap-1">
                        <ExclamationTriangleIcon className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        Click &quot;Sync Products&quot; to fetch ASINs from Amazon before analysing
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
              
              {/* Debug: Check Tables */}
              <div className="mt-2">
                <button
                  onClick={async () => {
                    const res = await fetch('/api/check-arbitrage-tables')
                    const data = await res.json()
                    console.log('Table check:', data)
                    if (!data.tablesExist?.arbitrage_scans || !data.tablesExist?.arbitrage_opportunities) {
                      alert('⚠️ Database tables are missing!\n\nPlease run the SQL in supabase/create_arbitrage_scans_tables.sql in your Supabase SQL editor.')
                    } else {
                      alert('✅ All tables exist and are ready!')
                    }
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Check Database Tables
                </button>
              </div>
              
              {/* Analyze Buttons */}
              <div className="mt-4 flex gap-3">
                {/* Single Storefront Analysis */}
                {selectionMode === 'single' && (
                  <button
                    onClick={analyzeArbitrage}
                    disabled={!selectedStorefront || analyzing || analyzingSelectedStorefronts || analyzingAllSellers || productCount === 0}
                    className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-lg font-medium text-sm hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : productCount === 0 ? (
                      <>
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Sync First
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-4 w-4" />
                        Analyze Storefront
                      </>
                    )}
                  </button>
                )}

                {/* Multiple Storefronts Analysis */}
                {selectionMode === 'multiple' && (
                  <button
                    onClick={analyzeSelectedStorefronts}
                    disabled={selectedStorefronts.length === 0 || analyzingSelectedStorefronts || analyzing || analyzingAllSellers || productCount === 0}
                    className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium text-sm hover:from-orange-600 hover:to-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {analyzingSelectedStorefronts ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : selectedStorefronts.length === 0 ? (
                      <>
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Select Storefronts
                      </>
                    ) : productCount === 0 ? (
                      <>
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        No Products
                      </>
                    ) : (
                      <>
                        <BuildingStorefrontIcon className="h-4 w-4" />
                        Analyze {selectedStorefronts.length} Storefront{selectedStorefronts.length > 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                )}
                
                {/* All Sellers Analysis */}
                {selectionMode === 'all' && (
                  <button
                    onClick={analyzeAllSellers}
                    disabled={analyzing || analyzingAllSellers || analyzingSelectedStorefronts || storefronts.length === 0}
                    className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-medium text-sm hover:from-green-600 hover:to-emerald-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {analyzingAllSellers ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Analyzing All...
                      </>
                    ) : (
                      <>
                        <UserGroupIcon className="h-4 w-4" />
                        All Sellers ({storefronts.length})
                      </>
                    )}
                  </button>
                )}
              </div>
              
              {analysisStats && (
                <div className="mt-4 space-y-3">
                  {/* Time Estimate Banner */}
                  {(analyzing || analyzingSelectedStorefronts || analyzingAllSellers) && analysisStats.estimatedMinutesRemaining !== undefined && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="w-5 h-5 text-indigo-600" />
                          <span className="text-sm font-medium text-indigo-900">
                            Estimated time: ~{analysisStats.estimatedMinutesRemaining} minute{analysisStats.estimatedMinutesRemaining > 1 ? 's' : ''}
                          </span>
                        </div>
                        {analysisStats.processedCount !== undefined && analysisStats.totalProducts && (
                          <span className="text-sm text-indigo-700">
                            {analysisStats.processedCount} / {analysisStats.totalProducts} products
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Progress Bar */}
                  {analyzing && analysisStats.progress !== undefined && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2.5 rounded-full transition-all duration-300 relative" 
                        style={{ width: `${analysisStats.progress}%` }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Progress Message */}
                  {analysisStats.progressMessage && (
                    <p className="text-sm text-gray-700 font-medium">{analysisStats.progressMessage}</p>
                  )}
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="flex items-center gap-2">
                      <SparklesIcon className="w-4 h-4 text-green-600" />
                      Found {analysisStats.totalOpportunities} opportunities
                    </p>
                    {analysisStats.productsAnalyzed > 0 && (
                      <p>Analysed {analysisStats.productsAnalyzed} products</p>
                    )}
                    <p>Exchange rate: €1 = £{analysisStats.exchangeRate}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Storefronts Message */}
          {!loading && storefronts.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <BuildingStorefrontIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Storefronts Found</h3>
              <p className="text-gray-600 mb-4">You don&apos;t have any storefronts yet. Add your first storefront to start analysing deals.</p>
              <button
                onClick={() => setShowAddStorefrontModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition"
              >
                Add Your First Storefront
              </button>
            </div>
          )}


          {/* Results Section */}
          {opportunities.length > 0 && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="bg-gradient-to-r from-violet-500 to-indigo-500 rounded-2xl p-6 text-white">
                <h2 className="text-2xl font-bold mb-4">
                  Deals 
                  {analyzing && <span className="text-violet-200">(Live Updates)</span>}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-violet-100 text-sm mb-1">Found Deals</p>
                    <p className="text-3xl font-bold">{summaryStats.totalDeals}</p>
                    <p className="text-sm text-violet-200 mt-1">{summaryStats.profitableDeals} profitable</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-violet-100 text-sm mb-1">Potential Profit</p>
                    <p className="text-3xl font-bold">£{summaryStats.totalPotentialProfit.toFixed(2)}</p>
                    <p className="text-sm text-violet-200 mt-1">Total combined</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-violet-100 text-sm mb-1">Average ROI</p>
                    <p className="text-3xl font-bold">{summaryStats.averageROI.toFixed(1)}%</p>
                    <p className="text-sm text-violet-200 mt-1">Profitable deals only</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-violet-100 text-sm mb-1">Exchange Rate</p>
                    <p className="text-3xl font-bold">€1 = £{EUR_TO_GBP_RATE}</p>
                    <p className="text-sm text-violet-200 mt-1">EUR to GBP</p>
                  </div>
                </div>
                {analyzing && (
                  <div className="mt-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <p className="text-sm">Finding more opportunities...</p>
                  </div>
                )}
              </div>

              {/* Filters and Sort */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Listbox value={dealFilter} onChange={setDealFilter}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                          <span className="block truncate">
                            {dealFilter === 'profitable' && '✅ Profitable Only'}
                            {dealFilter === 'profitable-breakeven' && '⚖️ Include Break-Even'}
                            {dealFilter === 'all' && '📊 Show All Deals'}
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
                              {({ selected }) => (
                                <>
                                  <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                    ✅ Profitable Only
                                  </span>
                                  <span className="block text-xs text-gray-500 mt-1">
                                    Show only deals with profit &gt; £0.50
                                  </span>
                                </>
                              )}
                            </Listbox.Option>
                            <Listbox.Option
                              value="profitable-breakeven"
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-4 pr-4 ${
                                  active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                    ⚖️ Include Break-Even
                                  </span>
                                  <span className="block text-xs text-gray-500 mt-1">
                                    Show profitable + break-even deals (profit ≥ -£0.50)
                                  </span>
                                </>
                              )}
                            </Listbox.Option>
                            <Listbox.Option
                              value="all"
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-4 pr-4 ${
                                  active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                    📊 Show All Deals
                                  </span>
                                  <span className="block text-xs text-gray-500 mt-1">
                                    Include losses, break-even, and profitable deals
                                  </span>
                                </>
                              )}
                            </Listbox.Option>
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Sort by:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="profit">Highest Profit</option>
                        <option value="roi">Highest ROI</option>
                        <option value="margin">Highest Margin</option>
                        <option value="price">Lowest Price</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Select All for profitable deals */}
                    {getFilteredOpportunities(sortedOpportunities).length > 0 && (
                      <button
                        onClick={() => {
                          const profitableAsins = sortedOpportunities
                            .filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0)
                            .map(opp => opp.asin);
                          if (selectedDeals.size === profitableAsins.length) {
                            setSelectedDeals(new Set());
                          } else {
                            setSelectedDeals(new Set(profitableAsins));
                          }
                        }}
                        className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {selectedDeals.size > 0 && selectedDeals.size === sortedOpportunities.filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length 
                          ? 'Deselect All' 
                          : 'Select All Profitable'}
                      </button>
                    )}
                    
                    {selectedDeals.size > 0 && (
                      <>
                        <span className="text-sm text-gray-600">
                          {selectedDeals.size} selected
                        </span>
                        <button
                          onClick={() => {
                            const selectedOpps = sortedOpportunities.filter(opp => selectedDeals.has(opp.asin));
                            let bulkMessage = `🎯 *A2A EU Bulk Deals* (${selectedOpps.length} items)\n\n`;
                            let totalProfit = 0;
                            
                            selectedOpps.forEach((opp, index) => {
                              totalProfit += opp.bestOpportunity?.profit || 0;
                              bulkMessage += `${index + 1}. *${opp.productName}*\n`;
                              bulkMessage += `   ASIN: ${opp.asin}\n`;
                              bulkMessage += `   Buy: ${getCountryFlag(opp.bestOpportunity?.marketplace || 'EU')} £${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)} → UK £${(opp.targetPrice || 0).toFixed(2)}\n`;
                              bulkMessage += `   Profit: £${(opp.bestOpportunity?.profit || 0).toFixed(2)} (${(opp.bestOpportunity?.roi || 0).toFixed(1)}% ROI)\n\n`;
                            });
                            
                            bulkMessage += `💰 *Total Potential Profit: £${totalProfit.toFixed(2)}*`;
                            
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
                    
                    {viewingSavedScan && (
                      <button
                        onClick={() => {
                          setViewingSavedScan(null)
                          setOpportunities([])
                          setAnalysisStats(null)
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-all"
                      >
                        Clear Results
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Filter opportunities based on deal filter */}
              {(() => {
                const filteredOpportunities = getFilteredOpportunities(sortedOpportunities);
                
                if (filteredOpportunities.length === 0) {
                  const noOpportunitiesMessage = dealFilter === 'profitable' 
                    ? 'No profitable opportunities found yet'
                    : dealFilter === 'profitable-breakeven'
                    ? 'No profitable or break-even opportunities found yet'
                    : 'No opportunities found yet';
                    
                  return (
                    <div className="bg-yellow-50 rounded-xl p-8 text-center">
                      <p className="text-yellow-800 font-medium">
                        {noOpportunitiesMessage}
                      </p>
                      <p className="text-yellow-600 text-sm mt-1">
                        {analyzing ? 'Still analyzing products...' : 'Try analyzing more products or adjusting your criteria'}
                      </p>
                    </div>
                  );
                }
                
                return filteredOpportunities.map((opp, index) => {
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
                            {opp.storefronts && opp.storefronts.length > 0 && (
                              <span className="text-indigo-600">@ {opp.storefronts[0].name}</span>
                            )}
                          </div>
                          
                          {/* Sales and Rank Info */}
                          <div className="flex items-center gap-4 mt-3 mb-3 p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-blue-100 rounded">
                                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                              </div>
                              <div>
                                <span className="text-xs text-gray-600 font-medium">UK Sales Rank:</span>
                                <span className="text-sm font-bold text-gray-900 ml-1">
                                  {opp.ukSalesRank > 0 ? `#${opp.ukSalesRank.toLocaleString()}` : 'No rank data'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="p-1 bg-green-100 rounded">
                                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                              </div>
                              <div>
                                <span className="text-xs text-gray-600 font-medium">Est. Sales/month:</span>
                                <span className="text-sm font-bold text-green-600 ml-1">
                                  {opp.salesPerMonth && opp.salesPerMonth > 0 
                                    ? opp.salesPerMonth.toLocaleString()
                                    : opp.ukSalesRank > 0 
                                      ? `~${formatSalesEstimate(estimateMonthlySalesFromRank(opp.ukSalesRank))}`
                                      : 'No data'
                                  }
                                </span>
                              </div>
                            </div>
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
                        <div className="mt-3 flex gap-2 ml-auto">
                          {/* Debug Button */}
                          <button
                            onClick={() => {
                              const debugWindow = window.open('', '_blank', 'width=650,height=800,scrollbars=yes,resizable=yes');
                              if (debugWindow) {
                                // Use actual data from the opportunity
                                const sellingPrice = opp.targetPrice || 0;
                                const totalAmazonFees = opp.amazonFees || 0;
                                const referralFee = opp.referralFee || 0;
                                const fbaFee = opp.fbaFee || 0;
                                const digitalServicesFee = opp.digitalServicesFee || 0;
                                const vatOnSale = opp.vatOnSale || (sellingPrice / 1.20 * 0.20);
                                const netRevenue = opp.netRevenue || (sellingPrice - vatOnSale);
                                const costOfGoods = opp.bestOpportunity?.sourcePriceGBP || 0;
                                
                                // Calculate using the correct formula
                                const totalCosts = costOfGoods + totalAmazonFees + digitalServicesFee;
                                const profit = netRevenue - totalCosts;
                                
                                // For display
                                const displayReferralFee = referralFee;
                                const displayFbaFee = fbaFee;
                                const displayDigitalServicesFee = digitalServicesFee;
                                const otherAmazonFees = Math.max(0, totalAmazonFees - referralFee - fbaFee);
                                
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
                          
                          {/* WhatsApp Share Button */}
                          <button
                            onClick={() => {
                              const message = encodeURIComponent(
                                `🎯 **Luca is the best Deal**\n\n` +
                                `🛍️ **${opp.productName}** (${opp.asin})\n` +
                                `💰 **Profit: £${(opp.bestOpportunity?.profit || 0).toFixed(2)}** (${(opp.bestOpportunity?.roi || 0).toFixed(1)}% ROI)\n\n` +
                                `📍 Buy: Amazon ${opp.bestOpportunity?.marketplace || 'EU'} - £${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)} (€${(opp.bestOpportunity?.sourcePrice || 0).toFixed(2)})\n` +
                                `🇬🇧 Sell: Amazon UK - £${(opp.targetPrice || 0).toFixed(2)}\n\n` +
                                `🔗 [${opp.bestOpportunity?.marketplace || 'EU'} Link](${`https://www.amazon.${getAmazonDomain(opp.bestOpportunity?.marketplace || 'DE')}/dp/${opp.asin}`}) | [UK Link](${`https://www.amazon.co.uk/dp/${opp.asin}`})\n` +
                                `📸 [Image](${opp.productImage || 'No image available'})`
                              );
                              window.open(`https://wa.me/?text=${message}`, '_blank');
                            }}
                            className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                            Share
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
                          <p className="text-2xl font-bold text-blue-600">£{(opp.targetPrice || 0).toFixed(2)}</p>
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
                        <p className="text-sm text-gray-500">Ex-VAT: £{((opp.targetPrice || 0) / 1.2).toFixed(2)}</p>
                      </div>
                    </div>


                    {/* All EU Marketplace Prices */}
                    <div className="mt-6">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="text-blue-500">🇪🇺</span> ALL EU MARKETPLACES
                        <span className="text-sm font-normal text-gray-500">({opp.euPrices?.length || 0} MARKETS)</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {(opp.euPrices || []).map((euPrice, idx) => {
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
                                    <p className="text-sm text-gray-900">£{(euPrice.sourcePriceGBP || 0).toFixed(2)}</p>
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

                  </div>
                </div>
                );
              });
              })()}
            </div>
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
          fetchStorefronts()
        }}
      />
    </div>
  )
}

export default function A2AEUPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
      <A2AEUPageContent />
    </Suspense>
  )
}