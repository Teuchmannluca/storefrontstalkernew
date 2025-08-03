'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

interface Product {
  id: string
  asin: string
  product_name: string
  brand: string | null
  image_link: string | null
  current_sales_rank: number | null
  storefront_id: string
  seller_id: string
  storefront: {
    id: string
    name: string
    seller_id: string
  }
}

interface GroupedProduct {
  asin: string
  product_name: string
  brand: string | null
  image_link: string | null
  current_sales_rank: number | null
  storefronts: Array<{
    id: string
    name: string
    seller_id: string
  }>
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [groupedProducts, setGroupedProducts] = useState<GroupedProduct[]>([])
  const [totalProductsCount, setTotalProductsCount] = useState(0)
  const [uniqueAsinsCount, setUniqueAsinsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchProducts()
  }, [sortOrder])

  const fetchProducts = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log('Products - Auth check:', { user: user?.id, authError })
      
      if (authError) {
        console.error('Products - Auth error:', authError)
        router.push('/')
        return
      }
      
      if (!user) {
        console.log('Products - No user found, redirecting to login')
        router.push('/')
        return
      }

      // First get user's storefronts
      const { data: storefronts, error: storefrontsError } = await supabase
        .from('storefronts')
        .select('id')
        .eq('user_id', user.id)

      if (storefrontsError) throw storefrontsError

      const storefrontIds = storefronts?.map(s => s.id) || []

      // Get counts first
      const { count: totalCount, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .in('storefront_id', storefrontIds)

      if (countError) throw countError
      setTotalProductsCount(totalCount || 0)

      // Get unique ASINs count
      const { data: uniqueAsins, error: uniqueError } = await supabase
        .from('products')
        .select('asin')
        .in('storefront_id', storefrontIds)

      if (uniqueError) throw uniqueError
      const uniqueAsinSet = new Set((uniqueAsins || []).map(p => p.asin))
      setUniqueAsinsCount(uniqueAsinSet.size)

      // Then get products for those storefronts (limit to 1000 for display)
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          storefront:storefronts(id, name, seller_id)
        `)
        .in('storefront_id', storefrontIds)
        .order('created_at', { ascending: sortOrder === 'oldest' })
        .limit(1000)

      if (error) throw error

      setProducts(data || [])
      
      // Group products by ASIN
      const grouped = data?.reduce((acc: { [key: string]: GroupedProduct }, product) => {
        if (!acc[product.asin]) {
          acc[product.asin] = {
            asin: product.asin,
            product_name: product.product_name,
            brand: product.brand,
            image_link: product.image_link,
            current_sales_rank: product.current_sales_rank,
            storefronts: []
          }
        }
        
        // Update with better data if available
        if (product.product_name !== product.asin && acc[product.asin].product_name === product.asin) {
          acc[product.asin].product_name = product.product_name
          acc[product.asin].brand = product.brand
          acc[product.asin].image_link = product.image_link
          acc[product.asin].current_sales_rank = product.current_sales_rank
        }
        
        acc[product.asin].storefronts.push(product.storefront)
        return acc
      }, {})

      setGroupedProducts(Object.values(grouped || {}))
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filteredProducts = groupedProducts.filter(product =>
    product.asin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="flex h-screen bg-white">
      <Sidebar onSignOut={handleSignOut} onAddStorefront={() => setShowAddStorefrontModal(true)} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">All Products</h1>
            <p className="text-gray-600 mt-2">View all products across your storefronts</p>
            <p className="text-sm text-gray-500 mt-1">Displaying latest 1,000 products for performance</p>
          </div>

          {/* Search Bar and Sort */}
          <div className="mb-6 flex gap-4">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ASIN, product name, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-900">{totalProductsCount.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm text-gray-600">Unique ASINs</p>
              <p className="text-2xl font-bold text-gray-900">{uniqueAsinsCount.toLocaleString()}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-sm text-gray-600">Duplicates</p>
              <p className="text-2xl font-bold text-gray-900">{(totalProductsCount - uniqueAsinsCount).toLocaleString()}</p>
            </div>
          </div>

          {/* Products Grid */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <div key={product.asin} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  {/* Product Image */}
                  <div 
                    className="aspect-square bg-white relative cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      const popup = window.open(
                        '', 
                        `keepa-${product.asin}`,
                        'width=900,height=700,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no'
                      );
                      if (popup) {
                        popup.document.write(`
                          <html>
                            <head>
                              <title>Keepa Data - ${product.product_name}</title>
                              <style>
                                body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; }
                                .loading { text-align: center; padding: 50px; }
                              </style>
                            </head>
                            <body>
                              <div class="loading">
                                <h2>Loading Keepa data for ${product.product_name}</h2>
                                <p>ASIN: ${product.asin}</p>
                                <p>Please wait...</p>
                              </div>
                            </body>
                          </html>
                        `);
                      }
                    }}
                  >
                    {product.image_link ? (
                      <img
                        src={product.image_link}
                        alt={product.product_name}
                        className="w-full h-full object-contain p-4"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        <span className="text-sm">No image</span>
                      </div>
                    )}
                    {product.storefronts.length > 1 && (
                      <div className="absolute top-2 right-2 bg-indigo-500 text-white text-xs px-2 py-1 rounded-full">
                        {product.storefronts.length} sellers
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
                      {product.product_name}
                    </h3>
                    {product.brand && (
                      <p className="text-xs text-gray-600 mb-2">{product.brand}</p>
                    )}
                    <p className="text-xs text-gray-500 mb-3">ASIN: {product.asin}</p>
                    {product.current_sales_rank && (
                      <p className="text-xs text-gray-600 mb-3">Rank: #{product.current_sales_rank.toLocaleString()}</p>
                    )}

                    {/* Storefronts */}
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-gray-700 mb-2">Available at:</p>
                      <div className="space-y-1">
                        {product.storefronts.map((storefront) => (
                          <div key={storefront.id} className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 truncate">{storefront.name}</span>
                            <a
                              href={`https://www.amazon.co.uk/dp/${product.asin}?m=${storefront.seller_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-700 ml-2"
                            >
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Google Search Button */}
                    <div className="mt-3 pt-3 border-t">
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(product.product_name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 rounded-lg transition-all"
                      >
                        Google
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredProducts.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">No products found</p>
            </div>
          )}
        </div>
      </div>

      <AddStorefrontModal
        isOpen={showAddStorefrontModal}
        onClose={() => setShowAddStorefrontModal(false)}
        onSuccess={fetchProducts}
      />
    </div>
  )
}