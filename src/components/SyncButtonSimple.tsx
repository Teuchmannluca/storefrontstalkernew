'use client'

import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface SyncButtonSimpleProps {
  storefrontId: string
  sellerId: string
  className?: string
}

export default function SyncButtonSimple({ storefrontId, sellerId, className = '' }: SyncButtonSimpleProps) {
  return (
    <button
      onClick={() => console.log('Sync clicked for:', storefrontId, sellerId)}
      className={`inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all ${className}`}
      title="Sync products from Amazon"
    >
      <ArrowPathIcon className="w-4 h-4" />
      Sync Products
    </button>
  )
}