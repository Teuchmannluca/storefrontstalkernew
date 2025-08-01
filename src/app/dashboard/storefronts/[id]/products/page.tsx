'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { 
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  CurrencyPoundIcon,
  ChartBarIcon,
  PhotoIcon,
  BellIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import SyncButton from '@/components/SyncButton'
import UpdateDetailsButton from '@/components/UpdateDetailsButton'
import FetchAmazonDetailsButton from '@/components/FetchAmazonDetailsButton'

interface Product {
  id: string
  asin: string
  product_name: string
  price: number | null
  image_link: string | null
  current_sales_rank: number | null
  brand: string | null
  last_updated: string
}

interface Storefront {
  id: string
  name: string
  seller_id: string
}

export default function ProductsPage() {
  const params = useParams()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [storefront, setStorefront] = useState<Storefront | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
      } else {
        setUser(user)
        fetchStorefrontAndProducts()
      }
    }
    checkUser()
  }, [params?.id, router])

  const fetchStorefrontAndProducts = async () => {
    try {
      // Fetch storefront details
      const { data: storefrontData, error: storefrontError } = await supabase
        .from('storefronts')
        .select('*')
        .eq('id', params?.id || '')
        .single()

      if (storefrontError) throw storefrontError
      setStorefront(storefrontData)

      // Fetch products for this storefront
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('storefront_id', params?.id || '')
        .order('last_updated', { ascending: false })

      if (productsError) throw productsError
      setProducts(productsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.asin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  )

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
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard/storefronts"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                >
                  <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
                </Link>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-800">
                    {storefront?.name} Products
                  </h1>
                  <p className="text-sm text-gray-500">
                    Seller ID: {storefront?.seller_id} • {products.length} products
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Search */}
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
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
          </div>
        </header>

      {/* Products Grid */}
      <div className="p-8">
        {/* Action buttons */}
        {storefront && products.length > 0 && (
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">
              Products ({filteredProducts.length})
            </h2>
            <div className="flex items-center gap-3">
              <SyncButton
                storefrontId={storefront.id}
                sellerId={storefront.seller_id}
                storefrontName={storefront.name}
                onSyncComplete={fetchStorefrontAndProducts}
                className=""
              />
              <UpdateDetailsButton
                storefrontId={storefront.id}
                onUpdateComplete={fetchStorefrontAndProducts}
                className=""
              />
              <FetchAmazonDetailsButton
                storefrontId={storefront.id}
                onUpdateComplete={fetchStorefrontAndProducts}
                className=""
              />
            </div>
          </div>
        )}
        
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <PhotoIcon className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {searchTerm ? 'No products found' : 'No products synced yet'}
              </h3>
              <p className="text-gray-600">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Click "Sync Products" on the storefront to fetch products from Amazon.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all">
                {/* Product Image */}
                <div className="aspect-square bg-gray-50 relative">
                  {product.image_link ? (
                    <img
                      src={product.image_link}
                      alt={product.product_name}
                      className="w-full h-full object-contain p-4"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PhotoIcon className="w-16 h-16 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                    {product.product_name}
                  </h3>
                  
                  <p className="text-xs text-gray-500 mb-3">
                    {product.brand || 'No brand'} • {product.asin}
                  </p>

                  <div className="flex items-center justify-between mb-3">
                    {product.price !== null ? (
                      <div className="flex items-center gap-1">
                        <CurrencyPoundIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-lg font-semibold text-gray-900">
                          {product.price.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No price</span>
                    )}

                    {product.current_sales_rank && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <ChartBarIcon className="w-4 h-4" />
                        <span>Rank: {product.current_sales_rank.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <a
                      href={`https://www.amazon.co.uk/dp/${product.asin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      View on Amazon →
                    </a>
                    
                    <span className="text-xs text-gray-400">
                      {new Date(product.last_updated).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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