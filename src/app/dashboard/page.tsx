'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { 
  BellIcon, 
  MagnifyingGlassIcon,
  PlusIcon,
  BuildingStorefrontIcon,
  LinkIcon,
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import SyncButton from '@/components/SyncButton'

interface Storefront {
  id: string
  seller_id: string
  name: string
  storefront_url: string
  created_at: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [storefronts, setStorefronts] = useState<Storefront[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [productsCount, setProductsCount] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
      } else {
        setUser(user)
        fetchStorefronts()
        fetchProductsCount()
      }
      setLoading(false)
    }
    checkUser()
  }, [router])

  const fetchStorefronts = async () => {
    const { data, error } = await supabase
      .from('storefronts')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      setStorefronts(data)
    }
  }

  const fetchProductsCount = async () => {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
    
    if (!error && count !== null) {
      setProductsCount(count)
    }
  }

  const handleDeleteStorefront = async (id: string) => {
    // Get product count for this storefront
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('storefront_id', id)
    
    const message = productCount && productCount > 0 
      ? `Are you sure you want to delete this storefront? This will also delete ${productCount} product${productCount > 1 ? 's' : ''}.`
      : 'Are you sure you want to delete this storefront?'
    
    if (confirm(message)) {
      const { error } = await supabase
        .from('storefronts')
        .delete()
        .eq('id', id)
      
      if (!error) {
        fetchStorefronts()
      } else {
        console.error('Error deleting storefront:', error)
        alert('Failed to delete storefront')
      }
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filteredStorefronts = storefronts.filter(storefront =>
    storefront.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    storefront.seller_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search storefronts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              
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

          {/* Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Storefronts</h3>
              <p className="text-3xl font-bold text-gray-800">{storefronts.length}</p>
              <p className="text-sm text-gray-500 mt-1">
                {storefronts.length === 0 ? 'No storefronts added yet' : 'Total storefronts'}
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Total Products</h3>
              <p className="text-3xl font-bold text-gray-800">{productsCount}</p>
              <p className="text-sm text-gray-500 mt-1">Across all storefronts</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Price Changes</h3>
              <p className="text-3xl font-bold text-gray-800">0</p>
              <p className="text-sm text-gray-500 mt-1">In the last 24 hours</p>
            </div>
          </div>

          {/* Storefronts List */}
          {filteredStorefronts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BuildingStorefrontIcon className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    {searchTerm ? 'No storefronts found' : 'Add Your First Storefront'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {searchTerm 
                      ? 'Try adjusting your search terms' 
                      : "Start monitoring your Amazon storefronts by adding your first one. You'll need the seller ID and storefront name."}
                  </p>
                  {!searchTerm && (
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition-all shadow-lg"
                    >
                      <PlusIcon className="w-5 h-5" />
                      Add Storefront
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">Your Storefronts</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {filteredStorefronts.map((storefront) => (
                  <div key={storefront.id} className="p-6 hover:bg-gray-50 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl flex items-center justify-center">
                          <BuildingStorefrontIcon className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{storefront.name}</h4>
                          <p className="text-sm text-gray-500">Seller ID: {storefront.seller_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SyncButton 
                          storefrontId={storefront.id} 
                          sellerId={storefront.seller_id}
                          storefrontName={storefront.name}
                          onSyncComplete={fetchStorefronts}
                          className="text-xs py-1.5"
                        />
                        <a
                          href={storefront.storefront_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                          title="View on Amazon"
                        >
                          <LinkIcon className="w-5 h-5" />
                        </a>
                        <button
                          onClick={() => handleDeleteStorefront(storefront.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete storefront"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Storefront Modal */}
      <AddStorefrontModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchStorefronts}
      />
    </div>
  )
}