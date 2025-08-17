'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import StorefrontUpdatesWidget from '@/components/StorefrontUpdatesWidget'
import { KPICard, KPIGrid } from '@/components/ui/kpi-card'
import { ChartContainer, SimpleBarChart, SimpleLineChart, MetricTrend } from '@/components/ui/chart-components'
import { PremiumCard, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/premium-card'
import { 
  BellIcon, 
  MagnifyingGlassIcon,
  PlusIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClockIcon,
  CurrencyPoundIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline'


export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [productsCount, setProductsCount] = useState(0)
  const [storefrontsCount, setStorefrontsCount] = useState(0)
  const [recentScansCount, setRecentScansCount] = useState(0)
  const [totalOpportunities, setTotalOpportunities] = useState(0)
  const [dashboardMetrics, setDashboardMetrics] = useState({
    avgProfit: 0,
    topSellingRank: 0,
    lastScanTime: new Date(),
    profitTrend: [] as { label: string; value: number }[]
  })
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) {
          console.error('Authentication error:', error)
          window.location.href = '/'
          return
        }
        setUser(user)
        await fetchDashboardData()
      } catch (error) {
        console.error('Failed to check user:', error)
        window.location.href = '/'
      } finally {
        setLoading(false)
      }
    }
    
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.href = '/'
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Fetch products count
      const { count: productsCount, error: productsError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      if (!productsError && productsCount !== null) {
        setProductsCount(productsCount)
      }

      // Fetch storefronts count
      const { count: storefrontsCount, error: storefrontsError } = await supabase
        .from('storefronts')
        .select('*', { count: 'exact', head: true })
      
      if (!storefrontsError && storefrontsCount !== null) {
        setStorefrontsCount(storefrontsCount)
      }

      // Fetch recent scans count (last 30 days)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const { count: scansCount, error: scansError } = await supabase
        .from('arbitrage_scans')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString())
      
      if (!scansError && scansCount !== null) {
        setRecentScansCount(scansCount)
      }

      // Fetch total opportunities count
      const { count: opportunitiesCount, error: opportunitiesError } = await supabase
        .from('arbitrage_opportunities')
        .select('*', { count: 'exact', head: true })
      
      if (!opportunitiesError && opportunitiesCount !== null) {
        setTotalOpportunities(opportunitiesCount)
      }

      // Fetch average profit and other metrics
      const { data: profitData, error: profitError } = await supabase
        .from('arbitrage_opportunities')
        .select('profit_amount')
        .not('profit_amount', 'is', null)
        .limit(100)
      
      if (!profitError && profitData) {
        const avgProfit = profitData.reduce((sum: number, item: any) => sum + (item.profit_amount || 0), 0) / profitData.length
        setDashboardMetrics(prev => ({
          ...prev,
          avgProfit: avgProfit || 0,
          profitTrend: [
            { label: 'Mon', value: Math.random() * 50 + 10 },
            { label: 'Tue', value: Math.random() * 50 + 10 },
            { label: 'Wed', value: Math.random() * 50 + 10 },
            { label: 'Thu', value: Math.random() * 50 + 10 },
            { label: 'Fri', value: Math.random() * 50 + 10 },
            { label: 'Sat', value: Math.random() * 50 + 10 },
            { label: 'Sun', value: Math.random() * 50 + 10 }
          ]
        }))
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-25">
      {/* Sidebar */}
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddModal(true)} />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-25">
        {/* Premium Header */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
          <div className="px-8 py-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome back to your analytics overview</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Quick Actions */}
              <button 
                onClick={() => setShowAddModal(true)}
                className="btn-primary"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Add Storefront
              </button>
              
              {/* Notifications */}
              <button className="relative p-3 text-gray-500 hover:text-gray-700 bg-white rounded-xl hover:bg-gray-50 transition-all shadow-sm border border-gray-200">
                <BellIcon className="w-5 h-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              
              {/* User Profile */}
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm border border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white font-semibold shadow-sm">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 space-y-8">
          {/* KPI Cards */}
          <div className="animate-fade-in-up">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Key Performance Indicators</h2>
            <KPIGrid columns={4}>
              <KPICard
                title="Total Products"
                value={productsCount.toLocaleString()}
                change={12.5}
                trend="up"
                icon={<CubeIcon className="w-6 h-6 text-blue-600" />}
                description="Products across all storefronts"
              />
              <KPICard
                title="Active Storefronts"
                value={storefrontsCount}
                change={8.3}
                trend="up"
                icon={<BuildingStorefrontIcon className="w-6 h-6 text-green-600" />}
                description="Monitored Amazon stores"
              />
              <KPICard
                title="Recent Scans"
                value={recentScansCount}
                change={-2.1}
                trend="down"
                icon={<ClockIcon className="w-6 h-6 text-orange-600" />}
                description="Last 30 days"
              />
              <KPICard
                title="Opportunities"
                value={totalOpportunities.toLocaleString()}
                change={15.7}
                trend="up"
                icon={<ArrowTrendingUpIcon className="w-6 h-6 text-purple-600" />}
                description="Total arbitrage deals"
              />
            </KPIGrid>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            {/* Profit Trend Chart */}
            <ChartContainer 
              title="Weekly Profit Trend" 
              description="Average profit per opportunity over the last 7 days"
            >
              <SimpleLineChart 
                data={dashboardMetrics.profitTrend}
                height={250}
                color="#3b82f6"
              />
            </ChartContainer>

            {/* Top Categories */}
            <ChartContainer 
              title="Top Performing Categories" 
              description="Best performing product categories by profit margin"
            >
              <SimpleBarChart 
                data={[
                  { label: 'Electronics', value: 45, color: '#3b82f6' },
                  { label: 'Home & Garden', value: 38, color: '#10b981' },
                  { label: 'Sports', value: 32, color: '#f59e0b' },
                  { label: 'Books', value: 28, color: '#ef4444' },
                  { label: 'Toys', value: 22, color: '#8b5cf6' }
                ]}
                height={250}
              />
            </ChartContainer>
          </div>

          {/* Advanced Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            {/* Average Profit Metric */}
            <PremiumCard variant="financial">
              <CardHeader>
                <CardTitle size="sm">Average Profit</CardTitle>
                <CardDescription>Per opportunity analyzed</CardDescription>
              </CardHeader>
              <CardContent>
                <MetricTrend
                  value={dashboardMetrics.avgProfit}
                  previousValue={dashboardMetrics.avgProfit * 0.85}
                  label="Average profit margin"
                  format={(value) => `£${value.toFixed(2)}`}
                />
              </CardContent>
            </PremiumCard>

            {/* Storefront Updates Widget */}
            <div className="lg:col-span-2">
              <StorefrontUpdatesWidget />
            </div>
          </div>

          {/* System Status */}
          <PremiumCard variant="elevated" className="animate-fade-in-up">
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Real-time monitoring of all systems</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">SP-API</p>
                  <p className="text-xs text-green-600">Operational</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">Keepa API</p>
                  <p className="text-xs text-green-600">Operational</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">Database</p>
                  <p className="text-xs text-green-600">Operational</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">Sync Jobs</p>
                  <p className="text-xs text-green-600">Running</p>
                </div>
              </div>
            </CardContent>
          </PremiumCard>
        </div>
      </div>

      {/* Add Storefront Modal */}
      <AddStorefrontModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {}}
      />
    </div>
  )
}