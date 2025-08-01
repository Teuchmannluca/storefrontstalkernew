'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface ProductDetails {
  asin: string;
  title: string;
  brand: string;
  mainImage: string;
  salesRanks: Array<{
    rank: number;
    category: string;
  }>;
}

export default function ASINSearch() {
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!asin.trim()) {
      setError('Please enter an ASIN');
      return;
    }

    setLoading(true);
    setError(null);
    setProduct(null);

    try {
      const response = await fetch(`/api/products/${asin.trim()}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch product details');
      }

      const data = await response.json();
      setProduct(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Product Search by ASIN</h2>
        
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="Enter ASIN (e.g., B08N5WRWNW)"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              pattern="[A-Z0-9]{10}"
              title="ASIN should be 10 characters long and contain only uppercase letters and numbers"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-6 py-2 rounded-lg hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {product && (
          <div className="border-t border-gray-200 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1">
                {product.mainImage ? (
                  <img
                    src={product.mainImage}
                    alt={product.title}
                    className="w-full h-auto rounded-lg shadow-sm"
                  />
                ) : (
                  <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400">No image available</span>
                  </div>
                )}
              </div>
              
              <div className="md:col-span-2">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {product.title}
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 font-medium">ASIN:</span>
                    <span className="ml-2 text-gray-800">{product.asin}</span>
                  </div>
                  
                  <div>
                    <span className="text-gray-600 font-medium">Brand:</span>
                    <span className="ml-2 text-gray-800">{product.brand || 'N/A'}</span>
                  </div>
                  
                  <div>
                    <span className="text-gray-600 font-medium">Sales Ranks:</span>
                    {product.salesRanks.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {product.salesRanks.map((rank, index) => (
                          <li key={index} className="text-gray-700">
                            #{rank.rank.toLocaleString()} in {rank.category}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="ml-2 text-gray-500">No sales rank data</span>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <a
                    href={`https://www.amazon.co.uk/dp/${product.asin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    View on Amazon →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}