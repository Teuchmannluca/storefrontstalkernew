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
  GlobeEuropeAfricaIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  NoSymbolIcon,
  ShoppingBagIcon,
  HeartIcon,
  BellIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import { 
  HomeIcon as HomeIconSolid,
  BuildingStorefrontIcon as BuildingStorefrontIconSolid,
  CubeIcon as CubeIconSolid,
  GlobeEuropeAfricaIcon as GlobeEuropeAfricaIconSolid,
  MagnifyingGlassIcon as MagnifyingGlassIconSolid,
  ClockIcon as ClockIconSolid,
  NoSymbolIcon as NoSymbolIconSolid,
  ShoppingBagIcon as ShoppingBagIconSolid,
  HeartIcon as HeartIconSolid,
  BellIcon as BellIconSolid,
  BuildingOfficeIcon as BuildingOfficeIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  DocumentTextIcon as DocumentTextIconSolid
} from '@heroicons/react/24/solid'

interface SidebarProps {
  onSignOut: () => void
  onAddStorefront?: () => void
}

interface NavigationGroup {
  title: string
  items: NavigationItem[]
}

interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<any>
  iconActive: React.ComponentType<any>
  badge?: number
  description?: string
}

const navigationGroups: NavigationGroup[] = [
  {
    title: 'Analytics',
    items: [
      { 
        name: 'Dashboard', 
        href: '/dashboard', 
        icon: HomeIcon, 
        iconActive: HomeIconSolid,
        description: 'Overview and insights'
      },
      { 
        name: 'A2A EU', 
        href: '/dashboard/a2a-eu', 
        icon: GlobeEuropeAfricaIcon, 
        iconActive: GlobeEuropeAfricaIconSolid,
        description: 'EU arbitrage analysis'
      },
      { 
        name: 'Recent Scans', 
        href: '/dashboard/recent-scans', 
        icon: ClockIcon, 
        iconActive: ClockIconSolid,
        description: 'Latest scan results'
      },
    ]
  },
  {
    title: 'Operations',
    items: [
      { 
        name: 'Storefronts', 
        href: '/dashboard/storefronts', 
        icon: BuildingStorefrontIcon, 
        iconActive: BuildingStorefrontIconSolid,
        description: 'Manage tracked stores'
      },
      { 
        name: 'All Products', 
        href: '/dashboard/products', 
        icon: CubeIcon, 
        iconActive: CubeIconSolid,
        description: 'Product inventory'
      },
      { 
        name: 'Sourcing Lists', 
        href: '/dashboard/sourcing-lists', 
        icon: ShoppingBagIcon, 
        iconActive: ShoppingBagIconSolid,
        description: 'Saved opportunities'
      },
      { 
        name: 'B2B Arbitrage', 
        href: '/dashboard/b2b-arbitrage', 
        icon: BuildingOfficeIcon, 
        iconActive: BuildingOfficeIconSolid,
        description: 'Business-to-business deals'
      },
    ]
  },
  {
    title: 'Tools',
    items: [
      { 
        name: 'ASIN Checker', 
        href: '/dashboard/asin-checker', 
        icon: MagnifyingGlassIcon, 
        iconActive: MagnifyingGlassIconSolid,
        description: 'Single product analysis'
      },
      { 
        name: 'Blacklist', 
        href: '/dashboard/blacklist', 
        icon: NoSymbolIcon, 
        iconActive: NoSymbolIconSolid,
        description: 'Excluded products'
      },
      { 
        name: 'API Health', 
        href: '/dashboard/api-health', 
        icon: HeartIcon, 
        iconActive: HeartIconSolid,
        description: 'System status'
      },
      { 
        name: 'Notifications', 
        href: '/dashboard/notifications', 
        icon: BellIcon, 
        iconActive: BellIconSolid,
        description: 'Alerts and updates'
      },
    ]
  }
]

export default function Sidebar({ onSignOut, onAddStorefront }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-72 bg-white border-r border-gray-100 h-screen">
      {/* Premium Brand Header */}
      <div className="h-20 px-6 flex items-center border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
            <ChartBarIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg leading-tight">Storefront Stalker</h1>
            <p className="text-xs text-gray-500 font-medium">Professional Edition</p>
          </div>
        </div>
      </div>

      {/* Add Storefront Button */}
      {onAddStorefront && (
        <div className="px-6 py-4">
          <button
            onClick={onAddStorefront}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            Add Storefront
          </button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 py-6 px-4 space-y-8 overflow-y-auto">
        {navigationGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <h2 className="nav-group-title">{group.title}</h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href
                const Icon = isActive ? item.iconActive : item.icon
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200
                      ${isActive 
                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm border-r-2 border-blue-600' 
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                      }
                    `}
                  >
                    <div className={`
                      p-2 rounded-lg transition-colors duration-200
                      ${isActive 
                        ? 'bg-blue-100 text-blue-600' 
                        : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-600'
                      }
                    `}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isActive ? 'text-blue-900' : ''}`}>
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className="ml-2 bg-red-100 text-red-800 text-xs font-medium px-2 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className={`text-xs mt-0.5 truncate ${
                          isActive ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Premium Bottom Section */}
      <div className="p-4 space-y-2 border-t border-gray-100 bg-gray-50">
        <div className="text-center py-3">
          <div className="text-xs text-gray-500 mb-1">Professional Plan</div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-gray-700">All Systems Operational</span>
          </div>
        </div>
        
        <Link
          href="/dashboard/settings"
          className="nav-item group"
        >
          <div className="p-2 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-600">
            <CogIcon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">Settings</span>
        </Link>
        
        <button
          onClick={onSignOut}
          className="w-full nav-item group text-left"
        >
          <div className="p-2 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-gray-200 group-hover:text-gray-600">
            <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  )
}