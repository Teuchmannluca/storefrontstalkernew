'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  BuildingStorefrontIcon, 
  CogIcon,
  ArrowRightStartOnRectangleIcon,
  PlusIcon,
  CubeIcon,
  GlobeEuropeAfricaIcon
} from '@heroicons/react/24/outline'
import { 
  HomeIcon as HomeIconSolid,
  BuildingStorefrontIcon as BuildingStorefrontIconSolid,
  CubeIcon as CubeIconSolid,
  GlobeEuropeAfricaIcon as GlobeEuropeAfricaIconSolid
} from '@heroicons/react/24/solid'

interface SidebarProps {
  onSignOut: () => void
  onAddStorefront?: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, iconActive: HomeIconSolid },
  { name: 'Storefronts', href: '/dashboard/storefronts', icon: BuildingStorefrontIcon, iconActive: BuildingStorefrontIconSolid },
  { name: 'All Products', href: '/dashboard/products', icon: CubeIcon, iconActive: CubeIconSolid },
  { name: 'A2A EU', href: '/dashboard/a2a-eu', icon: GlobeEuropeAfricaIcon, iconActive: GlobeEuropeAfricaIconSolid },
]

export default function Sidebar({ onSignOut, onAddStorefront }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-100 h-screen">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-400 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          </div>
          <span className="text-gray-800 font-semibold text-lg">Storefront Stalker</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {/* Add Storefront Button */}
        {onAddStorefront && (
          <button
            onClick={onAddStorefront}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 transition-all duration-200 shadow-lg mb-4"
          >
            <PlusIcon className="w-5 h-5" />
            Add Storefront
          </button>
        )}

        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = isActive ? item.iconActive : item.icon
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive 
                  ? 'bg-gradient-to-r from-violet-50 to-indigo-50 text-indigo-600 shadow-sm' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3 space-y-1 border-t border-gray-100">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
        >
          <CogIcon className="w-5 h-5 text-gray-400" />
          Settings
        </Link>
        
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
        >
          <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-gray-400" />
          Sign Out
        </button>
      </div>
    </div>
  )
}