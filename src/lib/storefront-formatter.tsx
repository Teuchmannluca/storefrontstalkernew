import React from 'react'
import { BuildingStorefrontIcon } from '@heroicons/react/24/outline'

interface Storefront {
  id: string
  name: string
  seller_id: string
}

interface StorefrontDisplayProps {
  storefronts?: Storefront[]
  className?: string
}

export function StorefrontDisplay({ storefronts, className = "" }: StorefrontDisplayProps) {
  if (!storefronts || storefronts.length === 0) {
    return null
  }

  const firstStorefront = storefronts[0]
  const additionalCount = storefronts.length - 1

  if (storefronts.length === 1) {
    return (
      <span className={`text-indigo-600 ${className}`}>
        @ {firstStorefront.name}
      </span>
    )
  }

  // If only 2 storefronts, show both names
  if (storefronts.length === 2) {
    return (
      <span className={`text-indigo-600 ${className}`}>
        @ {firstStorefront.name} & {storefronts[1].name}
      </span>
    )
  }

  // For 3+ storefronts, show first and +X more with tooltip
  return (
    <div className={`relative inline-flex items-center group ${className}`}>
      <span className="text-indigo-600">
        @ {firstStorefront.name}
      </span>
      <span className="ml-1 text-indigo-500 font-medium">
        +{additionalCount} more
      </span>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
        <div className="bg-gray-900 text-white text-sm rounded-lg py-2 px-3 shadow-lg max-w-xs">
          <div className="flex items-center gap-1 mb-1 font-medium">
            <BuildingStorefrontIcon className="w-4 h-4" />
            Available at {storefronts.length} storefronts:
          </div>
          <div className="space-y-1">
            {storefronts.map((storefront, index) => (
              <div key={storefront.id} className="text-gray-200">
                {index + 1}. {storefront.name}
              </div>
            ))}
          </div>
          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-gray-900"></div>
        </div>
      </div>
    </div>
  )
}

// Utility function for simple text display (e.g., in WhatsApp messages)
export function formatStorefrontsText(storefronts?: Storefront[]): string {
  if (!storefronts || storefronts.length === 0) {
    return ''
  }

  if (storefronts.length === 1) {
    return `@ ${storefronts[0].name}`
  }

  if (storefronts.length === 2) {
    return `@ ${storefronts[0].name} & ${storefronts[1].name}`
  }

  return `@ ${storefronts[0].name} +${storefronts.length - 1} more`
}