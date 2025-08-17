'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import B2BASINListManager from '@/components/B2BASINListManager'
import { 
  ArrowPathIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ShoppingCartIcon,
  BuildingOfficeIcon,
  CurrencyPoundIcon
} from '@heroicons/react/24/outline'
import { estimateMonthlySalesFromRank } from '@/lib/sales-estimator'
import { 
  getB2BProfitCategoryColor, 
  getB2BProfitCategoryBgColor, 
  getB2BProfitCategoryIcon, 
  getB2BProfitCategoryLabel 
} from '@/lib/b2b-profit-calculator'

interface B2BArbitrageOpportunity {
  asin: string
  productName: string
  productImage: string
  ukB2bPrice: number
  ukB2bStandardPrice?: number
  ukB2cPrice: number
  priceDifference: number
  discountPercentage: number
  amazonFees: number
  referralFee: number
  fbaFee: number
  vatAmount: number
  netRevenue: number
  netProfit: number
  roiPercentage: number
  profitMargin: number
  profitCategory: 'profitable' | 'breakeven' | 'loss'
  quantityForLowestPrice?: number
  quantityTiers?: Array<{
    quantity: number
    price: number
    discount?: string
  }>
  ukSalesRank: number
  salesPerMonth?: number
  competitorsCount: number
  keepaSalesData?: any
}

type SortOption = 'profit' | 'roi' | 'discount' | 'price'
type ProfitFilter = 'profitable' | 'include-breakeven' | 'all'

export default function B2BArbitragePage() {
  const [opportunities, setOpportunities] = useState<B2BArbitrageOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const analysisRef = useRef<HTMLDivElement>(null)
  const [analysisStats, setAnalysisStats] = useState<{
    totalOpportunities: number
    productsAnalyzed: number
    progressMessage?: string
    progress?: number
    excludedCount?: number
    totalAsins?: number
  } | null>(null)
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>('profitable')
  const [sortBy, setSortBy] = useState<SortOption>('profit')
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [asinInput, setAsinInput] = useState('')
  const [asinList, setAsinList] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isVatRegistered, setIsVatRegistered] = useState(false)
  const [lastScanId, setLastScanId] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveListName, setSaveListName] = useState('')
  const [existingLists, setExistingLists] = useState<any[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [currentListId, setCurrentListId] = useState<string | null>(null)
  const [currentListName, setCurrentListName] = useState<string>('')
  const [showSaveListModal, setShowSaveListModal] = useState(false)
  const [showAddToListModal, setShowAddToListModal] = useState(false)
  const [availableLists, setAvailableLists] = useState<any[]>([])
  const [selectedExistingListId, setSelectedExistingListId] = useState<string>('')
  const router = useRouter()

  useEffect(() => {
    checkAuth()
    fetchExistingLists()
    fetchAvailableLists()
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

  // Load list from ASINListManager
  const handleLoadList = (asins: string[], listName: string, listId: string) => {
    setAsinList(asins)
    setCurrentListName(listName)
    setCurrentListId(listId)
    setAsinInput('')
    setValidationErrors({})
  }

  // Scan list immediately
  const handleScanList = (asins: string[], listName: string, listId: string) => {
    setAsinList(asins)
    setCurrentListName(listName)
    setCurrentListId(listId)
    setAsinInput('')
    setValidationErrors({})
    // Start analysis immediately after state update
    setTimeout(() => {
      // This will be called after the component re-renders with the new asinList
      const startAnalysis = async () => {
        if (asins.length > 0) {
          analyzeASINs()
        }
      }
      startAnalysis()
    }, 100)
  }

  // Fetch available B2B ASIN lists
  const fetchAvailableLists = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/b2b-asin-lists', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const { lists } = await response.json()
        setAvailableLists(lists || [])
      }
    } catch (error) {
      console.error('Error fetching B2B lists:', error)
    }
  }

  // Save current ASINs as a new list
  const handleSaveAsList = async () => {
    if (asinList.length === 0) {
      alert('No ASINs to save')
      return
    }

    if (!saveListName.trim()) {
      alert('Please enter a list name')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/b2b-asin-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: saveListName,
          description: `B2B Arbitrage list with ${asinList.length} ASINs`,
          asins: asinList,
          is_favorite: false
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save list')
      }

      const { list } = await response.json()
      
      alert(`List "${saveListName}" saved successfully!`)
      setShowSaveListModal(false)
      setSaveListName('')
      setCurrentListId(list.id)
      setCurrentListName(list.name)
      
      // Refresh lists
      fetchAvailableLists()
    } catch (error) {
      console.error('Error saving list:', error)
      alert('Failed to save list')
    }
  }

  // Update existing list
  const handleUpdateList = async () => {
    if (!currentListId) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/b2b-asin-lists/${currentListId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          asins: asinList
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update list')
      }

      alert(`List "${currentListName}" updated successfully!`)
      
      // Refresh lists
      fetchAvailableLists()
    } catch (error) {
      console.error('Error updating list:', error)
      alert('Failed to update list')
    }
  }

  // Add to existing list
  const handleAddToExistingList = async () => {
    if (!selectedExistingListId) {
      alert('Please select a list')
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Get the existing list
      const existingList = availableLists.find(l => l.id === selectedExistingListId)
      if (!existingList) return

      // Merge ASINs (remove duplicates)
      const mergedAsins = [...new Set([...existingList.asins, ...asinList])]

      const response = await fetch(`/api/b2b-asin-lists/${selectedExistingListId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          asins: mergedAsins
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update list')
      }

      alert(`Added ${asinList.length} ASINs to "${existingList.name}"`)
      setShowAddToListModal(false)
      setSelectedExistingListId('')
      
      // Load the updated list
      setCurrentListId(selectedExistingListId)
      setCurrentListName(existingList.name)
      setAsinList(mergedAsins)
      
      // Refresh lists
      fetchAvailableLists()
    } catch (error) {
      console.error('Error updating list:', error)
      alert('Failed to add to list')
    }
  }

  const fetchExistingLists = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: lists, error } = await supabase
        .from('sourcing_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (!error && lists) {
        setExistingLists(lists)
      }
    } catch (error) {
      console.error('Error fetching lists:', error)
    }
  }

  const handleSaveToList = async () => {
    if (selectedDeals.size === 0) {
      alert('Please select at least one deal to save')
      return
    }

    setIsSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')

      // Get selected opportunities
      const selectedOpportunities = opportunities.filter(opp => selectedDeals.has(opp.asin))

      const response = await fetch('/api/b2b-arbitrage/save-to-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          opportunities: selectedOpportunities,
          listName: saveListName || undefined,
          listId: selectedListId || undefined
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save to list')
      }

      const result = await response.json()
      
      alert(`Successfully saved ${result.itemsSaved} items to "${result.listName}"`)
      
      // Reset selection and close modal
      setSelectedDeals(new Set())
      setShowSaveModal(false)
      setSaveListName('')
      setSelectedListId('')
      
      // Refresh lists
      fetchExistingLists()
      
    } catch (error: any) {
      console.error('Error saving to list:', error)
      alert(`Failed to save: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedDeals.size === opportunities.filter(opp => opp.profitCategory === 'profitable').length) {
      setSelectedDeals(new Set())
    } else {
      const profitableAsins = opportunities
        .filter(opp => opp.profitCategory === 'profitable')
        .map(opp => opp.asin)
      setSelectedDeals(new Set(profitableAsins))
    }
  }

  // Validate ASIN format
  const validateASIN = (asin: string): boolean => {
    const asinRegex = /^[A-Z0-9]{10}$/
    return asinRegex.test(asin.toUpperCase())
  }

  // Add ASINs from input
  const handleAddASINs = () => {
    const newASINs = asinInput
      .split(/[\s,\n]+/)
      .map((asin: any) => asin.trim().toUpperCase())
      .filter((asin: any) => asin.length > 0)
    
    const errors: Record<string, string> = {}
    const validASINs: string[] = []
    
    newASINs.forEach((asin: any) => {
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
    setAsinList(asinList.filter((a: any) => a !== asin))
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

  // Analyze ASINs for B2B arbitrage
  const analyzeASINs = async () => {
    if (asinList.length === 0) return
    
    setAnalyzing(true)
    setOpportunities([])
    setAnalysisStats(null)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session found')
      
      const response = await fetch('/api/b2b-arbitrage/analyze-asins-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          asins: asinList,
          isVatRegistered
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
                    productsAnalyzed: message.data.processedCount || message.data.current || 0,
                    ...prev,
                    progressMessage: message.data.step,
                    progress: message.data.progress,
                    excludedCount: message.data.excludedCount,
                    totalAsins: message.data.totalAsins
                  }))
                  if (message.data.scanId) {
                    setLastScanId(message.data.scanId)
                  }
                  break
                  
                case 'opportunity':
                  opportunityCount++
                  setOpportunities(prev => {
                    const newOpportunities = [...prev, message.data]
                    // Sort by best ROI
                    return newOpportunities.sort((a, b) => b.roiPercentage - a.roiPercentage)
                  })
                  setAnalysisStats(prev => ({
                    totalOpportunities: opportunityCount,
                    productsAnalyzed: prev?.productsAnalyzed || 0,
                    progressMessage: prev?.progressMessage,
                    progress: prev?.progress
                  }))
                  break
                  
                case 'complete':
                  setAnalysisStats(prev => ({
                    ...prev,
                    totalOpportunities: message.data.opportunitiesFound,
                    productsAnalyzed: message.data.totalProducts,
                    progressMessage: message.data.message,
                    progress: 100,
                    excludedCount: message.data.excludedCount
                  }))
                  if (message.data.scanId) {
                    setLastScanId(message.data.scanId)
                  }
                  break
                  
                case 'error':
                  console.error('Analysis error:', message.data.error)
                  alert(message.data.error)
                  setAnalyzing(false)
                  setAnalysisStats({
                    totalOpportunities: 0,
                    productsAnalyzed: 0,
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
    profitableDeals: opportunities.filter((opp: any) => opp.profitCategory === 'profitable').length,
    totalPotentialProfit: opportunities
      .filter((opp: any) => opp.netProfit > 0)
      .reduce((sum: any, opp: any) => sum + opp.netProfit, 0),
    averageDiscount: opportunities.length > 0
      ? opportunities.reduce((sum: any, opp: any) => sum + opp.discountPercentage, 0) / opportunities.length
      : 0,
    averageROI: opportunities.length > 0
      ? opportunities
          .filter((opp: any) => opp.netProfit > 0)
          .reduce((sum: any, opp: any) => sum + opp.roiPercentage, 0) / 
          opportunities.filter((opp: any) => opp.netProfit > 0).length
      : 0
  }

  // Sort opportunities based on selected criteria
  const sortedOpportunities = [...opportunities].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        return b.netProfit - a.netProfit
      case 'roi':
        return b.roiPercentage - a.roiPercentage
      case 'discount':
        return b.discountPercentage - a.discountPercentage
      case 'price':
        return a.ukB2bPrice - b.ukB2bPrice
      default:
        return 0
    }
  })

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar onSignOut={handleSignOut} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <BuildingOfficeIcon className="h-8 w-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-900">B2B Arbitrage</h1>
            </div>
            <p className="text-gray-600">Find profitable opportunities by buying at Amazon Business prices and selling at consumer prices</p>
          </div>

          {/* VAT Registration Toggle */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">VAT Registration Status</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {isVatRegistered 
                    ? 'VAT registered sellers can reclaim input VAT, improving profit margins'
                    : 'Non-VAT registered sellers must account for VAT in profit calculations'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVatRegistered}
                  onChange={(e) => setIsVatRegistered(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-900">
                  {isVatRegistered ? 'VAT Registered' : 'Not VAT Registered'}
                </span>
              </label>
            </div>
          </div>

          {/* Rate Limit Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">SP-API Rate Limits</h3>
                <p className="text-sm text-amber-700 mt-1">
                  B2B pricing requests have strict rate limits. The analysis will run slower to avoid quota errors. 
                  Processing 10 ASINs takes approximately 1-2 minutes. For best results, analyze 5-10 ASINs at a time.
                </p>
              </div>
            </div>
          </div>

          {/* B2B ASIN Lists Manager */}
          <B2BASINListManager 
            onLoadList={handleLoadList}
            onScanList={handleScanList}
            currentListId={currentListId}
          />

          {/* ASIN Input Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add ASINs to Check</h2>
              {currentListName && (
                <span className="text-sm text-indigo-600">
                  Loaded from: {currentListName}
                </span>
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter ASINs (comma-separated or one per line)
                </label>
                <textarea
                  value={asinInput}
                  onChange={(e) => setAsinInput(e.target.value)}
                  placeholder="B08N5WRWNW, B09B8V1QH5, B00HSMMFK6..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={4}
                />
              </div>
              
              <div className="space-y-3">
                {/* Primary action buttons */}
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
                      // Example ASINs for testing - reduced to 3 to avoid rate limits
                      setAsinInput('B09B8V1QH5, B08N5WRWNW, B0C4Z69NG3')
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <DocumentDuplicateIcon className="w-5 h-5" />
                    Load Example ASINs (3)
                  </button>
                </div>

                {/* List management buttons */}
                {asinList.length > 0 && (
                  <div className="flex items-center gap-3 border-t pt-3">
                    {currentListId ? (
                      <button
                        onClick={handleUpdateList}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        <PlusIcon className="w-5 h-5" />
                        Update &quot;{currentListName}&quot;
                      </button>
                    ) : (
                      availableLists.length > 0 && (
                        <button
                          onClick={() => setShowAddToListModal(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          <PlusIcon className="w-5 h-5" />
                          Add to Existing List
                        </button>
                      )
                    )}
                    
                    <button
                      onClick={() => setShowSaveListModal(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <DocumentDuplicateIcon className="w-5 h-5" />
                      Create New List
                    </button>
                  </div>
                )}
              </div>
              
              {/* Validation Errors */}
              {Object.keys(validationErrors).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Invalid ASINs:</p>
                  {Object.entries(validationErrors).map(([asin, error]: any) => (
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
                {asinList.map((asin: any) => (
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
                  className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 animate-spin" />
                      Analyzing B2B Arbitrage...
                    </>
                  ) : (
                    <>
                      <ShoppingCartIcon className="h-5 w-5" />
                      Analyze B2B to B2C Arbitrage
                    </>
                  )}
                </button>
                
                {analysisStats && (
                  <div ref={analysisRef} className="mt-4 space-y-2">
                    {/* Progress Bar */}
                    {analyzing && analysisStats.progress !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 h-2 rounded-full transition-all duration-300" 
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
                        <p>Analyzed {analysisStats.productsAnalyzed} of {analysisStats.totalAsins || asinList.length} ASINs</p>
                      )}
                      {analysisStats.excludedCount && analysisStats.excludedCount > 0 && (
                        <p className="text-amber-600">{analysisStats.excludedCount} ASINs excluded (blacklisted)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Section */}
          {opportunities.length > 0 && (
            <div className="space-y-6">
              {/* Summary Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
                <h2 className="text-2xl font-bold mb-4">
                  B2B Arbitrage Results
                  {analyzing && <span className="text-indigo-200 ml-2">(Live Updates)</span>}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-indigo-100 text-sm mb-1">Found Deals</p>
                    <p className="text-3xl font-bold">{summaryStats.totalDeals}</p>
                    <p className="text-sm text-indigo-200 mt-1">{summaryStats.profitableDeals} profitable</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-indigo-100 text-sm mb-1">Potential Profit</p>
                    <p className="text-3xl font-bold">£{summaryStats.totalPotentialProfit.toFixed(2)}</p>
                    <p className="text-sm text-indigo-200 mt-1">Total combined</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-indigo-100 text-sm mb-1">Avg Discount</p>
                    <p className="text-3xl font-bold">{summaryStats.averageDiscount.toFixed(1)}%</p>
                    <p className="text-sm text-indigo-200 mt-1">B2B vs B2C</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-indigo-100 text-sm mb-1">Average ROI</p>
                    <p className="text-3xl font-bold">{summaryStats.averageROI.toFixed(1)}%</p>
                    <p className="text-sm text-indigo-200 mt-1">Profitable deals</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                    <p className="text-indigo-100 text-sm mb-1">VAT Status</p>
                    <p className="text-2xl font-bold">{isVatRegistered ? 'Registered' : 'Not Registered'}</p>
                    <p className="text-sm text-indigo-200 mt-1">{isVatRegistered ? 'VAT Reclaimable' : '20% VAT Applied'}</p>
                  </div>
                </div>
              </div>

              {/* Filters and Sort */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Show:</span>
                      <select
                        value={profitFilter}
                        onChange={(e) => setProfitFilter(e.target.value as ProfitFilter)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="profitable">Profitable Only</option>
                        <option value="include-breakeven">Include Break-Even</option>
                        <option value="all">Show All Deals</option>
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Sort by:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="profit">Highest Profit</option>
                        <option value="roi">Highest ROI</option>
                        <option value="discount">Biggest Discount</option>
                        <option value="price">Lowest B2B Price</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {selectedDeals.size > 0 && (
                      <>
                        <span className="text-sm text-gray-600">
                          {selectedDeals.size} selected
                        </span>
                        <button
                          onClick={() => setShowSaveModal(true)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <DocumentDuplicateIcon className="w-4 h-4" />
                          Save to List
                        </button>
                      </>
                    )}
                    <button
                      onClick={toggleSelectAll}
                      className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {selectedDeals.size === opportunities.filter(opp => opp.profitCategory === 'profitable').length 
                        ? 'Deselect All' 
                        : 'Select All Profitable'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Opportunity Cards */}
              {(() => {
                const filteredOpportunities = sortedOpportunities.filter((opp: any) => {
                  switch (profitFilter) {
                    case 'profitable':
                      return opp.profitCategory === 'profitable';
                    case 'include-breakeven':
                      return opp.profitCategory === 'profitable' || opp.profitCategory === 'breakeven';
                    case 'all':
                      return true;
                    default:
                      return true;
                  }
                });
                
                if (filteredOpportunities.length === 0) {
                  return (
                    <div className="bg-yellow-50 rounded-xl p-8 text-center">
                      <p className="text-yellow-800 font-medium">
                        No opportunities found matching your filter criteria
                      </p>
                      <p className="text-yellow-600 text-sm mt-1">
                        {analyzing ? 'Still analyzing ASINs...' : 'Try adjusting your filter or analyzing more ASINs'}
                      </p>
                    </div>
                  );
                }
                
                return filteredOpportunities.map((opp: any, index: any) => (
                  <div key={opp.asin} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow relative">
                    {/* Selection Checkbox */}
                    {opp.profitCategory === 'profitable' && (
                      <div className="absolute top-6 right-6 z-10">
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
                        {/* Product Info */}
                        <div className="flex items-start gap-4 flex-1">
                          <div className="relative">
                            <div className="absolute -top-2 -left-2 w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
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
                              {opp.ukSalesRank > 0 && (
                                <span>BSR: #{opp.ukSalesRank.toLocaleString()}</span>
                              )}
                              {opp.salesPerMonth && opp.salesPerMonth > 0 && (
                                <span>Est. Sales: ~{opp.salesPerMonth}/mo</span>
                              )}
                            </div>
                            <div className="flex gap-4 mt-2">
                              <a
                                href={`https://www.amazon.co.uk/dp/${opp.asin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-sm"
                              >
                                View on Amazon UK
                              </a>
                              <a
                                href={`https://business.amazon.co.uk/dp/${opp.asin}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:underline text-sm"
                              >
                                View on Business
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Profit Info */}
                        <div className="text-right">
                          <p className="text-sm text-gray-500 mb-1">NET PROFIT</p>
                          <p className={`text-4xl font-bold ${getB2BProfitCategoryColor(opp.profitCategory)}`}>
                            £{opp.netProfit.toFixed(2)}
                          </p>
                          <div className="flex items-center justify-end gap-1 mt-2">
                            <span className={getB2BProfitCategoryColor(opp.profitCategory)}>
                              {getB2BProfitCategoryIcon(opp.profitCategory)}
                            </span>
                            <span className={`${getB2BProfitCategoryColor(opp.profitCategory)} font-medium`}>
                              {getB2BProfitCategoryLabel(opp.profitCategory)}
                            </span>
                          </div>
                          <div className="flex gap-6 mt-4 text-sm">
                            <div>
                              <p className="text-gray-500">ROI</p>
                              <p className={`font-semibold ${getB2BProfitCategoryColor(opp.profitCategory)}`}>
                                {opp.roiPercentage.toFixed(1)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Discount</p>
                              <p className="font-semibold text-purple-600">
                                {opp.discountPercentage.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Price Comparison */}
                      <div className="mt-6 grid grid-cols-2 gap-6">
                        <div className="bg-purple-50 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <BuildingOfficeIcon className="w-5 h-5 text-purple-600" />
                            <p className="text-sm font-semibold text-purple-900">B2B Business Price</p>
                          </div>
                          <p className="text-2xl font-bold text-purple-600">£{(opp.ukB2bPrice / 1.20).toFixed(2)}</p>
                          <p className="text-xs text-purple-700">£{opp.ukB2bPrice.toFixed(2)} inc. VAT</p>
                          {opp.quantityForLowestPrice && opp.quantityForLowestPrice > 1 ? (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-purple-800 bg-purple-100 inline-block px-2 py-1 rounded">
                                LOWEST PRICE at {opp.quantityForLowestPrice} units
                              </p>
                              {opp.ukB2bStandardPrice && opp.ukB2bStandardPrice !== opp.ukB2bPrice && (
                                <p className="text-xs text-purple-600 mt-1">
                                  Standard price (1 unit): £{(opp.ukB2bStandardPrice / 1.20).toFixed(2)} ex-VAT
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-purple-700 mt-1">Business price (ex-VAT)</p>
                          )}
                        </div>
                        
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <ShoppingCartIcon className="w-5 h-5 text-blue-600" />
                            <p className="text-sm font-semibold text-blue-900">B2C Consumer Price</p>
                          </div>
                          <p className="text-2xl font-bold text-blue-600">£{opp.ukB2cPrice.toFixed(2)}</p>
                          <p className="text-sm text-blue-700 mt-1">Selling price (Consumer)</p>
                        </div>
                      </div>
                      
                      {/* Quantity Tiers if available */}
                      {opp.quantityTiers && opp.quantityTiers.length > 0 && (
                        <div className="mt-4 bg-purple-50 rounded-xl p-4">
                          <p className="text-sm font-semibold text-purple-900 mb-2">Bulk Pricing Tiers Available</p>
                          <div className="flex flex-wrap gap-2">
                            {opp.quantityTiers.map((tier: any, idx: number) => (
                              <div key={idx} className="bg-white rounded-lg px-3 py-1.5 border border-purple-200">
                                <span className="text-xs font-medium text-purple-800">
                                  {tier.quantity} units: £{(tier.price / 1.20).toFixed(2)} ex-VAT
                                  {tier.discount && <span className="text-purple-600"> ({tier.discount})</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-purple-600 mt-2">
                            * Profit calculated using the lowest available price
                          </p>
                        </div>
                      )}

                      {/* Calculation Breakdown */}
                      <div className="mt-6 pt-6 border-t border-gray-100">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Profit Calculation Breakdown</h4>
                        <div className="grid grid-cols-4 gap-4 text-center">
                          <div>
                            <p className="text-sm text-gray-500">B2C Sale</p>
                            <p className="font-semibold text-gray-900">£{opp.ukB2cPrice.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">Inc. VAT</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Amazon Fees</p>
                            <p className="font-semibold text-red-600">-£{opp.amazonFees.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              (Ref: £{opp.referralFee.toFixed(2)} + FBA: £{opp.fbaFee.toFixed(2)})
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">VAT Impact</p>
                            <p className="font-semibold text-red-600">
                              {opp.vatAmount > 0 ? `-£${opp.vatAmount.toFixed(2)}` : '£0.00'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {isVatRegistered ? 'Neutral (pay to HMRC)' : 'Lost margin'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">B2B Cost</p>
                            <p className="font-semibold text-red-600">
                              -£{isVatRegistered ? (opp.ukB2bPrice / 1.20).toFixed(2) : opp.ukB2bPrice.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {isVatRegistered ? 'Ex-VAT (reclaim)' : 'Inc. VAT'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">Net Revenue:</span>
                            <span className="font-semibold text-gray-900">£{opp.netRevenue.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-medium text-gray-700">Net Profit:</span>
                            <span className={`font-bold text-lg ${getB2BProfitCategoryColor(opp.profitCategory)}`}>
                              £{opp.netProfit.toFixed(2)}
                            </span>
                          </div>
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
      
      {/* Save New List Modal */}
      {showSaveListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create New List</h2>
              <button
                onClick={() => {
                  setShowSaveListModal(false)
                  setSaveListName('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Save {asinList.length} ASINs as a new list for future use
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  List Name
                </label>
                <input
                  type="text"
                  value={saveListName}
                  onChange={(e) => setSaveListName(e.target.value)}
                  placeholder="Enter list name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSaveListModal(false)
                  setSaveListName('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAsList}
                disabled={!saveListName.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Existing List Modal */}
      {showAddToListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add to Existing List</h2>
              <button
                onClick={() => {
                  setShowAddToListModal(false)
                  setSelectedExistingListId('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Add {asinList.length} ASINs to an existing list
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select List
                </label>
                <select
                  value={selectedExistingListId}
                  onChange={(e) => setSelectedExistingListId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select a list...</option>
                  {availableLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.asin_count} ASINs)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddToListModal(false)
                  setSelectedExistingListId('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToExistingList}
                disabled={!selectedExistingListId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add to List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save to Sourcing List Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Save to Sourcing List</h2>
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  setSaveListName('')
                  setSelectedListId('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Save {selectedDeals.size} selected B2B arbitrage opportunities
            </p>
            
            <div className="space-y-4">
              {/* Existing List Selection */}
              {existingLists.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add to existing list
                  </label>
                  <select
                    value={selectedListId}
                    onChange={(e) => {
                      setSelectedListId(e.target.value)
                      setSaveListName('')
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select a list...</option>
                    {existingLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.item_count} items)
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Divider */}
              {existingLists.length > 0 && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or create new</span>
                  </div>
                </div>
              )}
              
              {/* New List Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Create new list
                </label>
                <input
                  type="text"
                  value={saveListName}
                  onChange={(e) => {
                    setSaveListName(e.target.value)
                    setSelectedListId('')
                  }}
                  placeholder="Enter list name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  setSaveListName('')
                  setSelectedListId('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToList}
                disabled={(!saveListName && !selectedListId) || isSaving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}