'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import ScheduleSettings from '@/components/ScheduleSettings'
import ArbitrageScheduleSettings from '@/components/ArbitrageScheduleSettings'
import ASINMonitorSettings from '@/components/ASINMonitorSettings'
import SettingsTabs, { MobileSettingsTabs } from '@/components/SettingsTabs'
import {
  BellIcon,
  CogIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  KeyIcon,
  ShieldCheckIcon,
  CloudIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('general')
  const [darkMode, setDarkMode] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [errorNotifications, setErrorNotifications] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [apiStats, setApiStats] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('Settings - Auth error:', error)
          router.push('/')
          return
        }
        
        if (!user) {
          router.push('/')
        } else {
          setUser(user)
          loadSettings(user.id)
        }
      } catch (error) {
        console.error('Settings - Error checking user:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    checkUser()
  }, [router])

  const loadSettings = async (userId: string) => {
    try {
      // Load user preferences from database
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (data) {
        setDarkMode(data.dark_mode || false)
        setEmailNotifications(data.email_notifications || true)
        setErrorNotifications(data.error_notifications || true)
        setWebhookUrl(data.webhook_url || '')
      }

      // Load API statistics
      loadApiStats()
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const loadApiStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch('/api/stats/api-usage', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const stats = await response.json()
        setApiStats(stats)
      }
    } catch (error) {
      console.error('Error loading API stats:', error)
    }
  }

  const savePreferences = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          dark_mode: darkMode,
          email_notifications: emailNotifications,
          error_notifications: errorNotifications,
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (error) {
      console.error('Error saving preferences:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-6">
            {/* User Profile Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <UserCircleIcon className="w-5 h-5" />
                User Profile
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
                  <input
                    type="text"
                    value={user?.id || ''}
                    disabled
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-600 font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Appearance Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Appearance</h3>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Dark Mode</h4>
                  <p className="text-sm text-gray-500">Use dark theme across the application</p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex items-center h-11 rounded-full w-20 transition-colors ${
                    darkMode ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block w-9 h-9 transform transition-transform bg-white rounded-full shadow-lg ${
                      darkMode ? 'translate-x-9' : 'translate-x-1'
                    }`}
                  >
                    {darkMode ? (
                      <MoonIcon className="w-5 h-5 m-2 text-indigo-600" />
                    ) : (
                      <SunIcon className="w-5 h-5 m-2 text-gray-600" />
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                <button className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
                  Export Data
                </button>
                <button className="px-4 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium">
                  Clear Cache
                </button>
              </div>
            </div>
          </div>
        )

      case 'storefront-sync':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <ScheduleSettings userId={user?.id} />
          </div>
        )

      case 'arbitrage-scans':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <ArbitrageScheduleSettings userId={user?.id} />
          </div>
        )

      case 'asin-monitoring':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <ASINMonitorSettings userId={user?.id} />
          </div>
        )

      case 'notifications':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Email Notifications
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Schedule Updates</h4>
                    <p className="text-sm text-gray-500">Receive email updates after scheduled runs</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={emailNotifications}
                      onChange={(e) => setEmailNotifications(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Error Notifications</h4>
                    <p className="text-sm text-gray-500">Get notified when scheduled updates fail</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={errorNotifications}
                      onChange={(e) => setErrorNotifications(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Price Alerts</h4>
                    <p className="text-sm text-gray-500">Get notified on significant price changes</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Webhook Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Webhook Integration
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Webhook URL
                  </label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-webhook-url.com/endpoint"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Receive POST requests for schedule events
                  </p>
                </div>
                <button
                  onClick={savePreferences}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Save Webhook Settings
                </button>
              </div>
            </div>
          </div>
        )

      case 'api-config':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                API Configuration
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Keepa API</h4>
                    <p className="text-sm text-gray-500">Product data and storefront tracking</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600">Connected</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Amazon SP-API</h4>
                    <p className="text-sm text-gray-500">Product details and pricing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600">Connected</span>
                  </div>
                </div>
              </div>
            </div>

            {/* API Usage Stats */}
            {apiStats && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  API Usage Statistics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Keepa Calls Today</p>
                    <p className="text-2xl font-bold text-gray-900">{apiStats.keepa?.today || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">SP-API Calls Today</p>
                    <p className="text-2xl font-bold text-gray-900">{apiStats.spApi?.today || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Token Usage</p>
                    <p className="text-2xl font-bold text-gray-900">{apiStats.keepa?.tokens || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600">Rate Limit</p>
                    <p className="text-2xl font-bold text-green-600">OK</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 'schedule-history':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ClockIcon className="w-5 h-5" />
              Schedule Run History
            </h3>
            <div className="text-center py-8 text-gray-500">
              <ClockIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Schedule history will appear here after your first automated runs</p>
            </div>
          </div>
        )

      case 'security':
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5" />
                Security Settings
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Two-Factor Authentication</h4>
                    <p className="text-sm text-gray-500">Add an extra layer of security</p>
                  </div>
                  <button className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
                    Enable
                  </button>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Session Management</h4>
                    <p className="text-sm text-gray-500">View and manage active sessions</p>
                  </div>
                  <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">
                    View Sessions
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">API Keys</h4>
                    <p className="text-sm text-gray-500">Manage your API access keys</p>
                  </div>
                  <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">
                    Manage Keys
                  </button>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar onSignOut={handleSignOut} />

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl flex items-center justify-center">
                <CogIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-800">Settings</h1>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <button className="relative p-2 text-gray-500 hover:text-gray-700 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                <BellIcon className="w-6 h-6" />
              </button>
              
              {/* User Profile */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {user?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">Admin</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-400 rounded-full flex items-center justify-center text-white font-medium">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="hidden lg:block">
            <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </header>

        {/* Mobile Tabs */}
        <div className="lg:hidden px-4 py-4">
          <MobileSettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Settings Content */}
        <div className="p-8">
          <div className="max-w-5xl mx-auto">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  )
}