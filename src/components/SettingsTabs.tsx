'use client'

import { useState } from 'react'
import {
  Cog6ToothIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  BellIcon,
  CloudIcon,
  ClockIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'

interface Tab {
  id: string
  name: string
  icon: React.ElementType
  description?: string
}

interface SettingsTabsProps {
  activeTab: string
  onTabChange: (tabId: string) => void
}

const TABS: Tab[] = [
  {
    id: 'general',
    name: 'General',
    icon: Cog6ToothIcon,
    description: 'Account settings and preferences'
  },
  {
    id: 'storefront-sync',
    name: 'Storefront Sync',
    icon: BuildingStorefrontIcon,
    description: 'Automatic storefront product updates'
  },
  {
    id: 'arbitrage-scans',
    name: 'Arbitrage Scans',
    icon: ChartBarIcon,
    description: 'A2A EU marketplace scanning schedule'
  },
  {
    id: 'asin-monitoring',
    name: 'ASIN Monitoring',
    icon: MagnifyingGlassIcon,
    description: 'Track price changes for ASIN lists'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    icon: BellIcon,
    description: 'Email alerts and notifications'
  },
  {
    id: 'api-config',
    name: 'API Configuration',
    icon: CloudIcon,
    description: 'External API connections and status'
  },
  {
    id: 'schedule-history',
    name: 'Schedule History',
    icon: ClockIcon,
    description: 'View past scheduled runs'
  },
  {
    id: 'security',
    name: 'Security',
    icon: ShieldCheckIcon,
    description: 'Security and privacy settings'
  }
]

export default function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8 px-6" aria-label="Settings tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const isHovered = hoveredTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
              className={`
                group relative inline-flex items-center px-1 py-4 text-sm font-medium transition-all
                ${
                  isActive
                    ? 'border-b-2 border-indigo-500 text-indigo-600'
                    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Icon
                className={`
                  -ml-0.5 mr-2 h-5 w-5 transition-colors
                  ${isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'}
                `}
              />
              <span>{tab.name}</span>

              {/* Tooltip with description */}
              {isHovered && tab.description && (
                <div className="absolute top-full left-0 mt-2 z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 max-w-xs">
                    <div className="font-medium mb-0.5">{tab.name}</div>
                    <div className="text-gray-300">{tab.description}</div>
                    <div className="absolute -top-1 left-8 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// Mobile-friendly tab navigation
export function MobileSettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const activeTabData = TABS.find(tab => tab.id === activeTab) || TABS[0]
  const ActiveIcon = activeTabData.icon

  return (
    <div className="lg:hidden">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <ActiveIcon className="w-5 h-5 text-indigo-600" />
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">{activeTabData.name}</div>
              {activeTabData.description && (
                <div className="text-xs text-gray-500">{activeTabData.description}</div>
              )}
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="py-2">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id

                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onTabChange(tab.id)
                      setIsOpen(false)
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                      ${isActive 
                        ? 'bg-indigo-50 text-indigo-600' 
                        : 'text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{tab.name}</div>
                      {tab.description && (
                        <div className="text-xs text-gray-500">{tab.description}</div>
                      )}
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}