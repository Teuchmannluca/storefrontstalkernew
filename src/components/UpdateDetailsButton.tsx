'use client'

import { useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface UpdateDetailsButtonProps {
  storefrontId: string
  onUpdateComplete?: () => void
  className?: string
}

export default function UpdateDetailsButton({ storefrontId, onUpdateComplete, className = '' }: UpdateDetailsButtonProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const handleUpdate = async () => {
    setLoading(true)
    setStatus(null)

    try {
      const response = await fetch('/api/update-product-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storefrontId,
          limit: 20
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        setStatus(`Updated ${data.updated} products`)
        if (onUpdateComplete) {
          onUpdateComplete()
        }
      } else {
        setStatus(data.error || 'Update failed')
      }

      // Clear status after 5 seconds
      setTimeout(() => setStatus(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleUpdate}
        disabled={loading}
        className={`inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${className}`}
        title="Fetch product details from Amazon"
      >
        <ArrowDownTrayIcon className={`w-4 h-4 ${loading ? 'animate-bounce' : ''}`} />
        {loading ? 'Updating...' : 'Update Product Details'}
      </button>
      
      {status && (
        <span className={`text-sm ${status.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
          {status}
        </span>
      )}
    </div>
  )
}