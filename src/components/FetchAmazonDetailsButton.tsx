'use client'

import { useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface FetchAmazonDetailsButtonProps {
  storefrontId: string
  onUpdateComplete?: () => void
  className?: string
}

export default function FetchAmazonDetailsButton({ storefrontId, onUpdateComplete, className = '' }: FetchAmazonDetailsButtonProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleFetch = async () => {
    setLoading(true)
    setStatus(null)

    try {
      // First, get products that need Amazon details
      const { supabase } = await import('@/lib/supabase')
      
      const { data: products, error } = await supabase
        .from('products')
        .select('asin')
        .eq('storefront_id', storefrontId)
        .or('product_name.like.Product %,image_link.is.null')
        .limit(20)

      if (error || !products || products.length === 0) {
        setStatus('No products need updating')
        return
      }

      const asins = products.map((p: any) => p.asin)
      console.log(`Fetching Amazon details for ${asins.length} products`)

      // Call the batch API
      const response = await fetch('/api/fetch-amazon-details', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asins,
          storefrontId
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        setStatus(`Updated ${data.updated} of ${data.found} products`)
        if (onUpdateComplete) {
          onUpdateComplete()
        }
      } else {
        setStatus(data.error || 'Failed to fetch details')
      }

      // Clear status after 5 seconds
      setTimeout(() => setStatus(null), 5000)
    } catch (error: any) {
      console.error('Error fetching Amazon details:', error)
      setStatus('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFetch}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
        title="Fetch product details from Amazon"
      >
        <ArrowDownTrayIcon className={`w-4 h-4 ${loading ? 'animate-bounce' : ''}`} />
        {loading ? 'Fetching...' : 'Fetch Amazon Details'}
      </button>
      
      {status && (
        <span className={`text-sm ${status.includes('Error') || status.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
          {status}
        </span>
      )}
    </div>
  )
}