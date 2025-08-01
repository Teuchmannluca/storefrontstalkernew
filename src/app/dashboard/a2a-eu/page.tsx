'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { 
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  SparklesIcon,
  UserGroupIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'

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
  ukCompetitors: number
  ukLowestPrice: number
  ukSalesRank: number
  euPrices: EUMarketplacePrice[]
  bestOpportunity: EUMarketplacePrice
  storefronts?: Array<{
    id: string
    name: string
    seller_id: string
  }>
}

type SortOption = 'profit' | 'roi' | 'margin' | 'price'

interface SavedScan {
  id: string
  scan_type: string
  storefront_name: string
  status: string
  total_products: number
  opportunities_found: number
  started_at: string
  completed_at: string | null
}

export default function A2AEUPage() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([])
  const [storefronts, setStorefronts] = useState<Storefront[]>([])
  const [selectedStorefront, setSelectedStorefront] = useState<Storefront | null>(null)
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStats, setAnalysisStats] = useState<{
    totalOpportunities: number
    productsAnalyzed: number
    exchangeRate: number
    progressMessage?: string
    progress?: number
  } | null>(null)
  const [productCount, setProductCount] = useState<number>(0)
  const [syncingProducts, setSyncingProducts] = useState(false)
  const [showProfitableOnly, setShowProfitableOnly] = useState(true)
  const [analyzingAllSellers, setAnalyzingAllSellers] = useState(false)
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [showSavedScans, setShowSavedScans] = useState(false)
  const [viewingSavedScan, setViewingSavedScan] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('profit')
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])
  
  useEffect(() => {
    if (selectedStorefront) {
      fetchProductCount()
    }
  }, [selectedStorefront])

  useEffect(() => {
    fetchSavedScans()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
    } else {
      fetchStorefronts()
    }
  }

  const fetchStorefronts = async () => {
    try {
      const { data, error } = await supabase
        .from('storefronts')
        .select('id, name, seller_id')
        .order('name')

      if (!error && data) {
        setStorefronts(data)
        if (data.length > 0) {
          setSelectedStorefront(data[0])
        }
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

  const fetchSavedScans = async () => {
    try {
      const { data, error } = await supabase
        .from('arbitrage_scans')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        setSavedScans(data)
      }
    } catch (error) {
      console.error('Error fetching saved scans:', error)
    }
  }
  
  const loadScanResults = async (scanId: string) => {
    setOpportunities([])
    setAnalysisStats(null)
    setViewingSavedScan(scanId)
    
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
    if (!selectedStorefront) return
    
    try {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('storefront_id', selectedStorefront.id)
      
      setProductCount(count || 0)
    } catch (error) {
      console.error('Error fetching product count:', error)
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
                    productsAnalyzed: 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    ...prev,
                    progressMessage: message.data.step,
                    progress: message.data.progress
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
                  fetchSavedScans()
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
                    progress: message.data.progress
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
                  fetchSavedScans()
                  break
                  
                case 'error':
                  console.error('Analysis error:', message.data.error)
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
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddStorefrontModal(true)} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">A2A Europe Arbitrage</h1>
                <p className="text-gray-600">Find profitable Amazon UK to EU arbitrage opportunities</p>
              </div>
              <button
                onClick={() => setShowSavedScans(!showSavedScans)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
              >
                <ClockIcon className="w-5 h-5" />
                {showSavedScans ? 'Hide' : 'Show'} Saved Scans
              </button>
            </div>
          </div>

          {/* Saved Scans Section */}
          {showSavedScans && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Scans</h3>
              {savedScans.length === 0 ? (
                <p className="text-gray-500">No saved scans yet</p>
              ) : (
                <div className="space-y-3">
                  {savedScans.map((scan) => (
                    <div key={scan.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-gray-900">{scan.storefront_name}</h4>
                          {scan.status === 'running' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                              <ArrowPathIcon className="w-3 h-3 animate-spin" />
                              Running
                            </span>
                          )}
                          {scan.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              <CheckCircleIcon className="w-3 h-3" />
                              Completed
                            </span>
                          )}
                          {scan.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                              <XCircleIcon className="w-3 h-3" />
                              Failed
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{new Date(scan.started_at).toLocaleString('en-GB')}</span>
                          {scan.total_products > 0 && (
                            <span>{scan.total_products} products</span>
                          )}
                          {scan.opportunities_found > 0 && (
                            <span className="text-green-600 font-medium">
                              {scan.opportunities_found} opportunities
                            </span>
                          )}
                        </div>
                      </div>
                      {scan.status === 'completed' && scan.opportunities_found > 0 && (
                        <button
                          onClick={() => loadScanResults(scan.id)}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-all"
                        >
                          View Results
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Storefront Selector */}
          {!loading && storefronts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Storefront
              </label>
              <Listbox value={selectedStorefront} onChange={setSelectedStorefront}>
                <div className="relative">
                  <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-white py-3 pl-4 pr-10 text-left border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                    <span className="block truncate">
                      {selectedStorefront ? (
                        <>
                          <span className="font-medium">{selectedStorefront.name}</span>
                          <span className="text-gray-500 ml-2">({selectedStorefront.seller_id})</span>
                        </>
                      ) : (
                        'Select a storefront'
                      )}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </span>
                  </Listbox.Button>
                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      {storefronts.map((storefront) => (
                        <Listbox.Option
                          key={storefront.id}
                          className={({ active }) =>
                            `relative cursor-pointer select-none py-3 pl-4 pr-4 ${
                              active ? 'bg-indigo-50 text-indigo-900' : 'text-gray-900'
                            }`
                          }
                          value={storefront}
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                {storefront.name}
                              </span>
                              <span className="text-gray-500 text-sm">
                                Seller ID: {storefront.seller_id}
                              </span>
                            </>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>
              
              {/* Product Count and Sync */}
              {selectedStorefront && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">
                      Products in storefront: <span className="font-medium text-gray-900">{productCount}</span>
                    </span>
                    <button
                      onClick={syncProducts}
                      disabled={syncingProducts}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
                    >
                      {syncingProducts ? 'Syncing...' : 'Sync Products'}
                    </button>
                  </div>
                  
                  {productCount === 0 && (
                    <p className="text-xs text-amber-600">
                      No products found. Click "Synchronise Products" to fetch ASINs from Amazon.
                    </p>
                  )}
                </div>
              )}
              
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
              <div className="mt-4 space-y-3">
                {/* Single Storefront Analysis */}
                <button
                  onClick={analyzeArbitrage}
                  disabled={!selectedStorefront || analyzing || productCount === 0}
                  className="w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      Analyzing Products...
                    </>
                  ) : productCount === 0 ? (
                    <>
                      <ExclamationTriangleIcon className="h-5 w-5" />
                      Sync Products First
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-5 w-5" />
                      Analyze Selected Storefront
                    </>
                  )}
                </button>
                
                {/* All Sellers Analysis */}
                <button
                  onClick={analyzeAllSellers}
                  disabled={analyzing || analyzingAllSellers || storefronts.length === 0}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzingAllSellers ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      Analyzing All Sellers...
                    </>
                  ) : (
                    <>
                      <UserGroupIcon className="h-5 w-5" />
                      Analyze All Sellers ({storefronts.length} storefronts)
                    </>
                  )}
                </button>
              </div>
              
              {analysisStats && (
                <div className="mt-4 space-y-2">
                  {/* Progress Bar */}
                  {analyzing && analysisStats.progress !== undefined && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${analysisStats.progress}%` }}
                      ></div>
                    </div>
                  )}
                  
                  {/* Progress Message */}
                  {analysisStats.progressMessage && (
                    <p className="text-sm text-gray-700 font-medium">{analysisStats.progressMessage}</p>
                  )}
                  
                  <div className="text-sm text-gray-600">
                    <p>Found {analysisStats.totalOpportunities} opportunities</p>
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
              <p className="text-gray-600 mb-4">You don't have any storefronts yet.</p>
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
                  Arbitrage Opportunities 
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
                    <button
                      onClick={() => setShowProfitableOnly(!showProfitableOnly)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                        showProfitableOnly
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-gray-100 text-gray-700 border border-gray-300'
                      } hover:bg-opacity-80`}
                    >
                      {showProfitableOnly ? '✅ Profitable Only' : 'Show All'}
                    </button>
                    
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
                    {sortedOpportunities.filter(opp => !showProfitableOnly || (opp.bestOpportunity && opp.bestOpportunity.profit > 0)).length > 0 && (
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
              
              {/* Filter opportunities based on profit toggle */}
              {(() => {
                const filteredOpportunities = sortedOpportunities.filter(
                  opp => !showProfitableOnly || (opp.bestOpportunity && opp.bestOpportunity.profit > 0)
                );
                
                if (filteredOpportunities.length === 0 && showProfitableOnly) {
                  return (
                    <div className="bg-yellow-50 rounded-xl p-8 text-center">
                      <p className="text-yellow-800 font-medium">
                        No profitable opportunities found yet
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
                          <div className="flex gap-6 mt-2">
                            <a
                              href={`https://www.amazon.co.uk/dp/${opp.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              View on Amazon UK
                            </a>
                            <a
                              href={`https://keepa.com/#!product/1-${opp.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:underline text-sm"
                            >
                              Keepa Charts
                            </a>
                            <button className="text-purple-600 hover:underline text-sm">SAS</button>
                          </div>
                        </div>
                      </div>

                      {/* Right: Profit Info */}
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">NET PROFIT (EX-VAT)</p>
                        <p className={`text-4xl font-bold ${opp.bestOpportunity?.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          £{(opp.bestOpportunity?.profit || 0).toFixed(2)}
                        </p>
                        {opp.bestOpportunity?.profit > 0 && (
                          <div className="flex items-center justify-end gap-1 mt-2">
                            <span className="text-green-600">✓</span>
                            <span className="text-green-600 font-medium">Profitable</span>
                          </div>
                        )}
                        <div className="flex gap-8 mt-4 text-sm">
                          <div>
                            <p className="text-gray-500">Margin</p>
                            <p className="font-semibold text-green-600">
                              {((opp.bestOpportunity?.profit / opp.targetPrice) * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">ROI</p>
                            <p className="font-semibold text-green-600">
                              {(opp.bestOpportunity?.roi || 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        
                        {/* WhatsApp Share Button */}
                        <button
                          onClick={() => {
                            const message = encodeURIComponent(
                              `🎯 *A2A EU Deal*\n\n` +
                              `📦 *Product:* ${opp.productName}\n` +
                              `🔗 *ASIN:* ${opp.asin}\n\n` +
                              `💰 *Profit:* £${(opp.bestOpportunity?.profit || 0).toFixed(2)} (${(opp.bestOpportunity?.roi || 0).toFixed(1)}% ROI)\n\n` +
                              `🛒 *Buy from:* ${getCountryFlag(opp.bestOpportunity?.marketplace || 'EU')} Amazon ${opp.bestOpportunity?.marketplace || 'EU'}\n` +
                              `💵 *Buy Price:* £${(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)} (€${(opp.bestOpportunity?.sourcePrice || 0).toFixed(2)})\n` +
                              `🔗 ${`https://www.amazon.${getAmazonDomain(opp.bestOpportunity?.marketplace || 'DE')}/dp/${opp.asin}`}\n\n` +
                              `🇬🇧 *Sell in UK:* £${(opp.targetPrice || 0).toFixed(2)}\n` +
                              `🔗 ${`https://www.amazon.co.uk/dp/${opp.asin}`}\n\n` +
                              `📸 *Product Image:* ${opp.productImage || 'No image available'}`
                            );
                            window.open(`https://wa.me/?text=${message}`, '_blank');
                          }}
                          className="mt-3 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1 ml-auto"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                          Share
                        </button>
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

                    {/* Bottom calculation summary */}
                    <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-500">Amazon Fees</p>
                        <p className="font-semibold text-gray-900">£{(opp.amazonFees || 0).toFixed(2)}</p>
                        <p className="text-xs text-green-600 mt-1">SP-API</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Cost of Goods</p>
                        <p className="font-semibold text-gray-900">£{(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">VAT (20%)</p>
                        <p className="font-semibold text-gray-900">£{((opp.targetPrice || 0) * 0.2 / 1.2).toFixed(2)}</p>
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