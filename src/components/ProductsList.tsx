'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowPathIcon, PhotoIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';

interface Product {
  id: string;
  asin: string;
  product_name: string | null;
  brand: string | null;
  image_link: string | null;
  current_sales_rank: number | null;
  sales_rank_category: string | null;
  last_checked: string | null;
}

interface ProductsListProps {
  storefrontId: string;
}

export default function ProductsList({ storefrontId }: ProductsListProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // Fetch products from Supabase
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('storefront_id', storefrontId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync all products with Amazon
  const syncProducts = async () => {
    setSyncing(true);
    setSyncProgress('Starting sync...');
    
    try {
      const response = await fetch('/api/sync-storefront-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storefrontId }),
      });

      const result = await response.json();
      
      if (result.success) {
        setSyncProgress(`Sync completed: ${result.updated} products updated`);
        // Refresh the products list
        await fetchProducts();
      } else {
        setSyncProgress(`Sync failed: ${result.error}`);
      }
    } catch (error) {
      setSyncProgress('Sync failed: Network error');
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
      // Clear progress message after 3 seconds
      setTimeout(() => setSyncProgress(''), 3000);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Load products on mount
  useEffect(() => {
    fetchProducts();
  }, [storefrontId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading products...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with sync button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Products ({products.length})
        </h3>
        <button
          onClick={syncProducts}
          disabled={syncing}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className={`-ml-0.5 mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync All Products'}
        </button>
      </div>

      {/* Sync progress message */}
      {syncProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
          {syncProgress}
        </div>
      )}

      {/* Products grid */}
      {products.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No products added yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200"
            >
              {/* Product image */}
              <div className="aspect-w-1 aspect-h-1 bg-gray-100">
                {product.image_link ? (
                  <Image
                    src={product.image_link}
                    alt={product.product_name || 'Product image'}
                    width={300}
                    height={192}
                    className="w-full h-48 object-contain p-4"
                    unoptimized={true}
                  />
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <PhotoIcon className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Product details */}
              <div className="px-4 py-4 sm:px-6">
                <h4 className="text-sm font-medium text-gray-900 line-clamp-2">
                  {product.product_name || 'Product name not available'}
                </h4>
                
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <dt className="text-gray-500">ASIN:</dt>
                    <dd className="text-gray-900 font-mono">{product.asin}</dd>
                  </div>
                  
                  {product.brand && (
                    <div className="flex justify-between text-sm">
                      <dt className="text-gray-500">Brand:</dt>
                      <dd className="text-gray-900">{product.brand}</dd>
                    </div>
                  )}
                  
                  {product.current_sales_rank && (
                    <div className="flex justify-between text-sm">
                      <dt className="text-gray-500">BSR:</dt>
                      <dd className="text-gray-900">
                        #{product.current_sales_rank.toLocaleString()}
                        {product.sales_rank_category && (
                          <span className="text-gray-500 text-xs block">
                            in {product.sales_rank_category}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500 pt-2">
                    Last updated: {formatDate(product.last_checked)}
                  </div>
                </dl>

                {/* View on Amazon button */}
                <div className="mt-3">
                  <a
                    href={`https://www.amazon.co.uk/dp/${product.asin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    View on Amazon
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}