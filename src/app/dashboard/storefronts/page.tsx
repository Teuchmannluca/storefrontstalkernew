'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  PencilIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon,
  ChevronDownIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import SyncButton from '@/components/SyncButton'

interface Storefront {
  id: string
  seller_id: string
  name: string
  storefront_url: string
  created_at: string
  product_count?: number
}

type ViewMode = 'grid' | 'list'
type SortOption = 'name' | 'date' | 'seller_id'
type SortOrder = 'asc' | 'desc'

export default function StorefrontsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [storefronts, setStorefronts] = useState<Storefront[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
      } else {
        setUser(user)
        fetchStorefronts()
      }
      setLoading(false)
    }
    checkUser()
  }, [router])

  const fetchStorefronts = async () => {
    const { data, error } = await supabase
      .from('storefronts')
      .select(`
        *,
        products(count)
      `)
      .order('created_at', { ascending: false })
    
    if (!error && data) {
      // Transform the data to include product count
      const storefrontsWithCount = data.map(storefront => ({
        ...storefront,
        product_count: storefront.products?.[0]?.count || 0
      }))
      setStorefronts(storefrontsWithCount)
    }
  }

  const handleDeleteStorefront = async (id: string) => {
    // Find the storefront to get product count
    const storefront = storefronts.find(s => s.id === id)
    const productCount = storefront?.product_count || 0
    
    const message = productCount > 0 
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

  const handleUpdateAllStorefronts = async () => {
    if (isUpdatingAll) return
    
    const confirmUpdate = confirm(`This will update all ${storefronts.length} storefronts. The process will take approximately ${storefronts.length * 3} minutes. Continue?`)
    if (!confirmUpdate) return

    setIsUpdatingAll(true)
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/storefronts/update-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to start update process')
      }

      const result = await response.json()
      alert(result.message || 'Update process started. This will run in the background.')
      
      // Refresh storefronts after a delay
      setTimeout(() => {
        fetchStorefronts()
      }, 5000)
    } catch (error) {
      console.error('Error updating storefronts:', error)
      alert('Failed to start update process')
    } finally {
      setIsUpdatingAll(false)
    }
  }

  // Filter storefronts based on search
  const filteredStorefronts = storefronts.filter(storefront =>
    storefront.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    storefront.seller_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort storefronts
  const sortedStorefronts = [...filteredStorefronts].sort((a, b) => {
    let compareValue = 0
    
    switch (sortBy) {
      case 'name':
        compareValue = a.name.localeCompare(b.name)
        break
      case 'seller_id':
        compareValue = a.seller_id.localeCompare(b.seller_id)
        break
      case 'date':
        compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        break
    }
    
    return sortOrder === 'asc' ? compareValue : -compareValue
  })

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
            <h1 className="text-2xl font-semibold text-gray-800">Storefronts</h1>
            
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

        {/* Storefronts Content */}
        <div className="p-8">
          {/* Controls Bar */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-gray-800">
                All Storefronts ({sortedStorefronts.length})
              </h2>
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  title="Grid view"
                >
                  <Squares2X2Icon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                  title="List view"
                >
                  <ListBulletIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sort Dropdown */}
              <Menu as="div" className="relative">
                <Menu.Button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <FunnelIcon className="w-4 h-4" />
                  Sort by
                  <ChevronDownIcon className="w-4 h-4" />
                </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="px-1 py-1">
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => {
                              setSortBy('name')
                              setSortOrder(sortBy === 'name' && sortOrder === 'asc' ? 'desc' : 'asc')
                            }}
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm`}
                          >
                            Name
                            {sortBy === 'name' && (
                              <span className="text-xs text-gray-500">
                                {sortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </button>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => {
                              setSortBy('date')
                              setSortOrder(sortBy === 'date' && sortOrder === 'desc' ? 'asc' : 'desc')
                            }}
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm`}
                          >
                            Date Added
                            {sortBy === 'date' && (
                              <span className="text-xs text-gray-500">
                                {sortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </button>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => {
                              setSortBy('seller_id')
                              setSortOrder(sortBy === 'seller_id' && sortOrder === 'asc' ? 'desc' : 'asc')
                            }}
                            className={`${
                              active ? 'bg-gray-100' : ''
                            } group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm`}
                          >
                            Seller ID
                            {sortBy === 'seller_id' && (
                              <span className="text-xs text-gray-500">
                                {sortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>

              {/* Update All Button */}
              <button 
                onClick={handleUpdateAllStorefronts}
                disabled={isUpdatingAll || storefronts.length === 0}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowPathIcon className={`w-5 h-5 ${isUpdatingAll ? 'animate-spin' : ''}`} />
                {isUpdatingAll ? 'Updating...' : 'Update All'}
              </button>

              {/* Add Button */}
              <button 
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-4 py-2 rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition-all shadow-lg"
              >
                <PlusIcon className="w-5 h-5" />
                Add Storefront
              </button>
            </div>
          </div>

          {/* Storefronts Display */}
          {sortedStorefronts.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BuildingStorefrontIcon className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    {searchTerm ? 'No storefronts found' : 'No storefronts yet'}
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {searchTerm 
                      ? 'Try adjusting your search terms' 
                      : "Get started by adding your first Amazon storefront."}
                  </p>
                  {!searchTerm && (
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition-all shadow-lg"
                    >
                      <PlusIcon className="w-5 h-5" />
                      Add Your First Storefront
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedStorefronts.map((storefront) => (
                <div key={storefront.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl flex items-center justify-center">
                      <BuildingStorefrontIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <Menu as="div" className="relative">
                      <Menu.Button className="p-1 text-gray-400 hover:text-gray-600">
                        <PencilIcon className="w-5 h-5" />
                      </Menu.Button>
                      <Transition
                        as={Fragment}
                        enter="transition ease-out duration-100"
                        enterFrom="transform opacity-0 scale-95"
                        enterTo="transform opacity-100 scale-100"
                        leave="transition ease-in duration-75"
                        leaveFrom="transform opacity-100 scale-100"
                        leaveTo="transform opacity-0 scale-95"
                      >
                        <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                href={`/dashboard/storefronts/${storefront.id}`}
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm`}
                              >
                                <BuildingStorefrontIcon className="w-4 h-4" />
                                View Details
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <a
                                href={storefront.storefront_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${
                                  active ? 'bg-gray-100' : ''
                                } group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm`}
                              >
                                <LinkIcon className="w-4 h-4" />
                                View on Amazon
                              </a>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={() => handleDeleteStorefront(storefront.id)}
                                className={`${
                                  active ? 'bg-red-50 text-red-600' : 'text-gray-700'
                                } group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm`}
                              >
                                <TrashIcon className="w-4 h-4" />
                                Delete
                              </button>
                            )}
                          </Menu.Item>
                        </Menu.Items>
                      </Transition>
                    </Menu>
                  </div>
                  
                  <h3 className="font-semibold text-gray-900 mb-1">{storefront.name}</h3>
                  <p className="text-sm text-gray-500 mb-1">{storefront.seller_id}</p>
                  <p className="text-sm font-medium text-indigo-600 mb-3">
                    {storefront.product_count || 0} products
                  </p>
                  
                  <div className="mb-3 space-y-2">
                    <SyncButton 
                      storefrontId={storefront.id} 
                      sellerId={storefront.seller_id}
                      storefrontName={storefront.name}
                      onSyncComplete={fetchStorefronts}
                      className="w-full text-xs py-1.5"
                    />
                    <Link
                      href={`/dashboard/storefronts/${storefront.id}`}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-medium hover:bg-indigo-100 transition-all"
                    >
                      View Details
                    </Link>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Added {new Date(storefront.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">Storefront</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">Seller ID</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-700">Date Added</th>
                      <th className="text-right px-6 py-4 text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedStorefronts.map((storefront) => (
                      <tr key={storefront.id} className="hover:bg-gray-50 transition-all">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl flex items-center justify-center">
                              <BuildingStorefrontIcon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                              <Link href={`/dashboard/storefronts/${storefront.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                                {storefront.name}
                              </Link>
                              <p className="text-xs text-gray-500">{storefront.product_count || 0} products</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{storefront.seller_id}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(storefront.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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