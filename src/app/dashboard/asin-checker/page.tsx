'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { 
  ArrowPathIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

// Exchange rate constant
const EUR_TO_GBP_RATE = 0.86

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

type SortOption = 'profit' | 'roi' | 'margin' | 'price'

export default function ASINCheckerPage() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStats, setAnalysisStats] = useState<{
    totalOpportunities: number
    productsAnalyzed: number
    exchangeRate: number
    progressMessage?: string
    progress?: number
  } | null>(null)
  const [showProfitableOnly, setShowProfitableOnly] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('profit')
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [asinInput, setAsinInput] = useState('')
  const [asinList, setAsinList] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
    } else {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Validate ASIN format
  const validateASIN = (asin: string): boolean => {
    // Amazon ASIN is 10 characters, alphanumeric
    const asinRegex = /^[A-Z0-9]{10}$/
    return asinRegex.test(asin.toUpperCase())
  }

  // Add ASINs from input
  const handleAddASINs = () => {
    const newASINs = asinInput
      .split(/[\s,\n]+/) // Split by spaces, commas, or newlines
      .map(asin => asin.trim().toUpperCase())
      .filter(asin => asin.length > 0)
    
    const errors: Record<string, string> = {}
    const validASINs: string[] = []
    
    newASINs.forEach(asin => {
      if (!validateASIN(asin)) {
        errors[asin] = 'Invalid ASIN format'
      } else if (asinList.includes(asin)) {
        errors[asin] = 'ASIN already added'
      } else {
        validASINs.push(asin)
      }
    })
    
    setValidationErrors(errors)
    
    if (validASINs.length > 0) {
      setAsinList([...asinList, ...validASINs])
      setAsinInput('')
    }
  }

  // Remove ASIN from list
  const handleRemoveASIN = (asin: string) => {
    setAsinList(asinList.filter(a => a !== asin))
    const newErrors = { ...validationErrors }
    delete newErrors[asin]
    setValidationErrors(newErrors)
  }

  // Clear all ASINs
  const handleClearAll = () => {
    setAsinList([])
    setValidationErrors({})
    setOpportunities([])
    setAnalysisStats(null)
  }

  // Analyze ASINs for arbitrage
  const analyzeASINs = async () => {
    if (asinList.length === 0) return
    
    setAnalyzing(true)
    setOpportunities([])
    setAnalysisStats(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/arbitrage/analyze-asins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          asins: asinList
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
                    productsAnalyzed: message.data.current || 0,
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
                  console.error('Analysis error:', message.data.error)
                  alert(message.data.error)
                  setAnalyzing(false)
                  setAnalysisStats({
                    totalOpportunities: 0,
                    productsAnalyzed: 0,
                    exchangeRate: EUR_TO_GBP_RATE,
                    progressMessage: `Error: ${message.data.error}`,
                    progress: 0
                  })
                  return
              }
            } catch (parseError) {
              console.error('Error parsing message:', parseError)
            }
          }
        }
      }
      
    } catch (error: any) {
      console.error('Analysis error:', error)
      alert(`Failed to analyze ASINs: ${error.message}`)
    } finally {
      setAnalyzing(false)
    }
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
      <Sidebar onSignOut={handleSignOut} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ASIN Checker</h1>
            <p className="text-gray-600">Check specific ASINs for Amazon UK to EU arbitrage opportunities</p>
          </div>

          {/* ASIN Input Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Add ASINs to Check</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter ASINs (comma-separated or one per line)
                </label>
                <textarea
                  value={asinInput}
                  onChange={(e) => setAsinInput(e.target.value)}
                  placeholder="B08N5WRWNW, B Echo (4th Echo Dot (5B09B8V1QH, ..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={4}
                />
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddASINs}
                  disabled={!asinInput.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <PlusIcon className="w-5 h-5" />
                  Add ASINs
                </button>
                
                <button
                  onClick={() => {
                    // Example ASINs for testing
                    setAsinInput('B09B8V1QH5, B004Q097PA, B00HSMMFK6, B0C4Z69NG3, B08N5WRWNW')
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <DocumentDuplicateIcon className="w-5 h-5" />
                  Load Example ASINs
                </button>
              </div>
              
              {/* Validation Errors */}
              {Object.keys(validationErrors).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Invalid ASINs:</p>
                  {Object.entries(validationErrors).map(([asin, error]) => (
                    <p key={asin} className="text-sm text-red-600">
                      {asin}: {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ASIN List */}
          {asinList.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  ASINs to Check ({asinList.length})
                </h3>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear All
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {asinList.map((asin) => (
                  <div key={asin} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-mono text-sm">{asin}</span>
                    <button
                      onClick={() => handleRemoveASIN(asin)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="mt-6">
                <button
                  onClick={analyzeASINs}
                  disabled={analyzing || asinList.length === 0}
                  className="w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      Analyzing ASINs...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-5 w-5" />
                      Analyze {asinList.length} ASINs
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
            </div>
          )}

          {/* Results Section - Same as A2A EU page */}
          {opportunities.length > 0 && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="bg-gradient-to-r from-violet-500 to-indigo-500 rounded-2xl p-6 text-white">
                <h2 className="text-2xl font-bold mb-4">
                  Analysis Results 
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
                            let bulkMessage = `🎯 *ASIN Checker Results* (${selectedOpps.length} items)\n\n`;
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
                  </div>
                </div>
              </div>

              {/* Opportunity Cards - Same as A2A EU */}
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
                              `🎯 *ASIN Check Result*\n\n` +
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
                        <p className="text-sm text-gray-500">VAT on Fees</p>
                        <p className="font-semibold text-gray-900">£{((opp.amazonFees || 0) * 0.2).toFixed(2)}</p>
                        <p className="text-xs text-green-600 mt-1">Reclaimable</p>
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
    </div>
  )
}