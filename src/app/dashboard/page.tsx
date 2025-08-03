'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import StorefrontUpdatesWidget from '@/components/StorefrontUpdatesWidget'
import { 
  BellIcon, 
  MagnifyingGlassIcon,
  PlusIcon
} from '@heroicons/react/24/outline'


export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [productsCount, setProductsCount] = useState(0)
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
        await fetchProductsCount()
      } catch (error) {
        console.error('Failed to check user:', error)
        window.location.href = '/'
      } finally {
        setLoading(false)
      }
    }
    
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.href = '/'
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProductsCount = async () => {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
    
    if (!error && count !== null) {
      setProductsCount(count)
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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddModal(true)} />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="px-8 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
            
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button className="relative p-2 text-gray-500 hover:text-gray-700 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                <BellIcon className="w-6 h-6" />
              </button>
              
              {/* User Profile */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">Admin</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-400 rounded-full flex items-center justify-center text-white font-medium">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8">
          {/* Welcome Section */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome back!</h2>
              <p className="text-gray-600">Manage your Amazon storefronts and monitor their performance.</p>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              <PlusIcon className="w-5 h-5" />
              Add Storefront
            </button>
          </div>

          {/* Main Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Left Column - Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Stats</h3>
                <p className="text-3xl font-bold text-gray-800">Overview</p>
                <p className="text-sm text-gray-500 mt-1">System metrics</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Total Products</h3>
                <p className="text-3xl font-bold text-gray-800">{productsCount}</p>
                <p className="text-sm text-gray-500 mt-1">Across all storefronts</p>
              </div>
            </div>

            {/* Right Column - Storefront Updates Widget */}
            <div className="lg:row-span-1">
              <StorefrontUpdatesWidget />
            </div>
          </div>

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