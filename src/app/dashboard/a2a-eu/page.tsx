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
  SparklesIcon
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
  const [showProfitableOnly, setShowProfitableOnly] = useState(false)
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])
  
  useEffect(() => {
    if (selectedStorefront) {
      fetchProductCount()
    }
  }, [selectedStorefront])

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

  const analyzeArbitrage = async () => {
    if (!selectedStorefront) return
    
    setAnalyzing(true)
    setOpportunities([])
    setAnalysisStats(null)
    
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
                  break
                  
                case 'error':
                  throw new Error(message.data.error)
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

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddStorefrontModal(true)} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">A2A Europe Arbitrage</h1>
            <p className="text-gray-600">Find profitable Amazon UK to EU arbitrage opportunities</p>
          </div>

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
                  
                  {/* Debug buttons */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/test-sp-api-raw')
                        const data = await res.json()
                        console.log('Raw SP-API Test:', data)
                        if (data.success) {
                          alert(`Raw Test: ✓ Success!\nURL: ${data.url}\nQuery: ${data.queryParams}\nGot pricing data: ${JSON.stringify(data.data).substring(0, 100)}...`)
                        } else {
                          alert(`Raw Test: ✗ Failed\nStatus: ${data.status}\nURL: ${data.url}\nError: ${JSON.stringify(data.data || data.error).substring(0, 200)}`)
                        }
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-1 rounded"
                    >
                      Raw Test
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/test-competitive-pricing')
                        const data = await res.json()
                        console.log('Competitive Pricing Test:', data)
                        alert(`Competitive Pricing: ${data.success ? '✓ Success!' : '✗ Failed'} ${data.success ? `Found ${data.productsReturned} products` : data.error}. Check console.`)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-1 rounded"
                    >
                      Test Pricing
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/test-pricing-formats')
                        const data = await res.json()
                        console.log('Format Test:', data)
                        const working = data.results?.find((r: any) => r.success);
                        if (working) {
                          alert(`Format Test: ✓ Success! "${working.format}" format works!`)
                        } else {
                          alert(`Format Test: ✗ None of the formats worked. Check console.`)
                        }
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-1 rounded"
                    >
                      Test Formats
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/test-sp-api-simple')
                        const data = await res.json()
                        console.log('Simple SP-API Test:', data)
                        alert(`Token: ${data.tokenSuccess ? '✓' : '✗'}, API: ${data.apiSuccess ? '✓' : '✗'}. ${data.message}`)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 px-2 py-1 rounded"
                    >
                      Simple Test
                    </button>
                  </div>
                  {productCount === 0 && (
                    <p className="text-xs text-amber-600">
                      No products found. Click "Sync Products" to fetch ASINs from Amazon.
                    </p>
                  )}
                </div>
              )}
              
              {/* Analyze Button */}
              <button
                onClick={analyzeArbitrage}
                disabled={!selectedStorefront || analyzing || productCount === 0}
                className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                    Analyze Arbitrage Opportunities
                  </>
                )}
              </button>
              
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
                      <p>Analyzed {analysisStats.productsAnalyzed} products</p>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Arbitrage Opportunities {analyzing && '(Live Updates)'}
                    {showProfitableOnly && (
                      <span className="ml-2 text-sm font-normal text-gray-600">
                        ({opportunities.filter(opp => opp.bestOpportunity && opp.bestOpportunity.profit > 0).length} profitable)
                      </span>
                    )}
                  </h2>
                  <button
                    onClick={() => setShowProfitableOnly(!showProfitableOnly)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      showProfitableOnly
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-gray-100 text-gray-700 border border-gray-300'
                    } hover:bg-opacity-80`}
                  >
                    {showProfitableOnly ? '💰 Showing Profitable Only' : 'Show All'}
                  </button>
                </div>
                {analyzing && (
                  <div className="flex items-center gap-2 text-sm text-indigo-600">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                    Finding opportunities...
                  </div>
                )}
              </div>
              
              {/* Filter opportunities based on profit toggle */}
              {(() => {
                const filteredOpportunities = opportunities.filter(
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
                
                return filteredOpportunities.map((opp) => (
                <div key={opp.asin} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="grid grid-cols-12 gap-6">
                    {/* Product Info */}
                    <div className="col-span-5 flex gap-4">
                      <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        {opp.productImage ? (
                          <img src={opp.productImage} alt={opp.productName} className="w-full h-full object-contain rounded-lg" />
                        ) : (
                          <span className="text-gray-400 text-xs">No image</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">{opp.productName}</h3>
                        <p className="text-sm text-gray-500">ASIN: {opp.asin}</p>
                        <p className="text-sm text-gray-500">UK Rank: #{opp.ukSalesRank.toLocaleString()}</p>
                        <p className="text-sm text-gray-500">{opp.ukCompetitors} UK sellers</p>
                      </div>
                    </div>
                    
                    {/* UK Sell Price */}
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600 mb-1">🇬🇧 Sell in UK</p>
                      <p className="text-xl font-bold text-gray-900">£{(opp.targetPrice || 0).toFixed(2)}</p>
                      <p className="text-sm text-gray-500">Low: £{(opp.ukLowestPrice || opp.targetPrice || 0).toFixed(2)}</p>
                    </div>
                    
                    {/* Amazon Fees */}
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600 mb-1">Amazon Fees</p>
                      <p className="text-lg font-semibold text-red-600">£{(opp.amazonFees || 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-500">Referral: £{(opp.referralFee || 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-500">Digital: £{(opp.digitalServicesFee || 0).toFixed(2)}</p>
                    </div>
                    
                    {/* Best Opportunity */}
                    <div className="col-span-3">
                      <p className="text-sm text-gray-600 mb-1">🏆 Best Opportunity</p>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {getCountryFlag(opp.bestOpportunity?.marketplace || 'EU')} {opp.bestOpportunity?.marketplace || 'EU'}
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            {(opp.bestOpportunity?.roi || 0).toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">€{(opp.bestOpportunity?.sourcePrice || 0).toFixed(2)} → £{(opp.bestOpportunity?.sourcePriceGBP || 0).toFixed(2)}</p>
                        <p className="text-sm font-medium text-green-600">Profit: £{(opp.bestOpportunity?.profit || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* All EU Marketplace Prices */}
                  <div className="mt-6 pt-6 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">All EU Marketplace Prices</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(opp.euPrices || []).map((euPrice) => (
                        <div 
                          key={euPrice.marketplace} 
                          className={`p-3 rounded-lg border ${
                            (euPrice.profit || 0) > 0 
                              ? euPrice.marketplace === opp.bestOpportunity?.marketplace
                                ? 'bg-green-50 border-green-200'
                                : 'bg-blue-50 border-blue-200'
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-900">
                              {getCountryFlag(euPrice.marketplace)} {euPrice.marketplace}
                            </span>
                            <span className={`text-sm font-bold ${
                              (euPrice.profit || 0) > 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {(euPrice.roi || 0).toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">€{(euPrice.sourcePrice || 0).toFixed(2)}</p>
                          <p className="text-sm text-gray-600">£{(euPrice.sourcePriceGBP || 0).toFixed(2)}</p>
                          <p className={`text-sm font-medium ${
                            (euPrice.profit || 0) > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {(euPrice.profit || 0) > 0 ? '+' : ''}£{(euPrice.profit || 0).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Calculation Summary */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-600">
                      <p className="mb-1">
                        <span className="font-medium">Best Deal:</span> Buy from {opp.bestOpportunity.marketplace} at £{opp.bestOpportunity.sourcePriceGBP.toFixed(2)} + Fees £{(opp.amazonFees + opp.digitalServicesFee).toFixed(2)} = £{opp.bestOpportunity.totalCost.toFixed(2)}
                      </p>
                      <p>
                        <span className="font-medium">Profit:</span> Sell at £{opp.targetPrice.toFixed(2)} - Costs £{opp.bestOpportunity.totalCost.toFixed(2)} = <span className="font-bold text-green-600">£{opp.bestOpportunity.profit.toFixed(2)} profit</span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Buy Links */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">Where to buy:</p>
                      <div className="flex space-x-3">
                        <a
                          href={`https://www.amazon.co.uk/dp/${opp.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                        >
                          🇬🇧 Buy UK
                        </a>
                        <a
                          href={`https://www.amazon.${getAmazonDomain(opp.bestOpportunity.marketplace)}/dp/${opp.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-2 border border-green-300 shadow-sm text-xs font-medium rounded-lg text-green-700 bg-green-50 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all"
                        >
                          {getCountryFlag(opp.bestOpportunity.marketplace)} Buy {opp.bestOpportunity.marketplace} (Best)
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ));
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