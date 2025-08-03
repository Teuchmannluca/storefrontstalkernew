'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import ScheduleSettings from '@/components/ScheduleSettings'
import {
  BellIcon,
  CogIcon
} from '@heroicons/react/24/outline'

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        console.log('Settings - Auth check:', { user: user?.id, error })
        
        if (error) {
          console.error('Settings - Auth error:', error)
          router.push('/')
          return
        }
        
        if (!user) {
          console.log('Settings - No user found, redirecting to login')
          router.push('/')
        } else {
          console.log('Settings - User authenticated, loading settings')
          setUser(user)
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
        </header>

        {/* Settings Content */}
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Automatic Update Schedule
              </h2>
              <p className="text-gray-600">
                Configure when your storefronts should be automatically updated with new products.
              </p>
            </div>

            {/* Schedule Settings Component */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <ScheduleSettings userId={user?.id} />
            </div>

            {/* Additional Settings Sections (placeholder for future) */}
            <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Notification Settings
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Email Notifications</h4>
                    <p className="text-sm text-gray-500">Receive email updates after scheduled runs</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">Error Notifications</h4>
                    <p className="text-sm text-gray-500">Get notified when scheduled updates fail</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* API Settings (placeholder for future) */}
            <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                API Configuration
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Keepa API Status
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Connected - {22} tokens per minute</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amazon SP-API Status
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Connected - Product details enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}