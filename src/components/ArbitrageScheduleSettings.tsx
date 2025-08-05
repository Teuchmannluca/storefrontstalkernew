'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ClockIcon,
  CalendarIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BuildingStorefrontIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'

interface ArbitrageScheduleSettings {
  id?: string
  enabled: boolean
  frequency: 'daily' | 'every_2_days' | 'weekly'
  time_of_day: string
  timezone: string
  days_of_week: number[]
  scan_type: 'single' | 'all'
  storefront_id?: string
  last_run?: string
  next_run?: string
}

interface ArbitrageScheduleSettingsProps {
  userId?: string
}

interface Storefront {
  id: string
  name: string
  seller_id: string
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily', description: 'Scan every day' },
  { value: 'every_2_days', label: 'Every 2 days', description: 'Scan every other day' },
  { value: 'weekly', label: 'Weekly', description: 'Scan on selected days of the week' }
]

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0')
  const time12 = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
  return { value: `${hour}:00`, label: `${hour}:00 (${time12})` }
})

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'Europe/Rome', label: 'Rome (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)' }
]

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' }
]

export default function ArbitrageScheduleSettings({ userId }: ArbitrageScheduleSettingsProps) {
  const [settings, setSettings] = useState<ArbitrageScheduleSettings>({
    enabled: false,
    frequency: 'daily',
    time_of_day: '02:00',
    timezone: 'UTC',
    days_of_week: [1, 2, 3, 4, 5, 6, 7],
    scan_type: 'single'
  })
  const [storefronts, setStorefronts] = useState<Storefront[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (userId) {
      loadSettings()
      loadStorefronts()
    }
  }, [userId])

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_arbitrage_schedule_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') { // Not "not found" error
        throw error
      }

      if (data) {
        setSettings({
          id: data.id,
          enabled: data.enabled,
          frequency: data.frequency,
          time_of_day: data.time_of_day,
          timezone: data.timezone,
          days_of_week: data.days_of_week || [1, 2, 3, 4, 5, 6, 7],
          scan_type: data.scan_type,
          storefront_id: data.storefront_id,
          last_run: data.last_run,
          next_run: data.next_run
        })
      }
    } catch (error) {
      console.error('Error loading arbitrage schedule settings:', error)
      setMessage({ type: 'error', text: 'Failed to load schedule settings' })
    } finally {
      setLoading(false)
    }
  }

  const loadStorefronts = async () => {
    try {
      const { data, error } = await supabase
        .from('storefronts')
        .select('id, name, seller_id')
        .eq('user_id', userId)
        .order('name')

      if (error) {
        throw error
      }

      setStorefronts(data || [])
    } catch (error) {
      console.error('Error loading storefronts:', error)
    }
  }

  const saveSettings = async () => {
    if (!userId) return

    setSaving(true)
    setMessage(null)

    try {
      const settingsToSave = {
        user_id: userId,
        enabled: settings.enabled,
        frequency: settings.frequency,
        time_of_day: settings.time_of_day,
        timezone: settings.timezone,
        days_of_week: settings.days_of_week,
        scan_type: settings.scan_type,
        storefront_id: settings.scan_type === 'single' ? settings.storefront_id : null
      }

      let result
      if (settings.id) {
        // Update existing settings
        result = await supabase
          .from('user_arbitrage_schedule_settings')
          .update(settingsToSave)
          .eq('id', settings.id)
          .select()
          .single()
      } else {
        // Create new settings
        result = await supabase
          .from('user_arbitrage_schedule_settings')
          .insert(settingsToSave)
          .select()
          .single()
      }

      if (result.error) {
        throw result.error
      }

      if (result.data) {
        setSettings(prev => ({
          ...prev,
          id: result.data.id,
          last_run: result.data.last_run,
          next_run: result.data.next_run
        }))
      }

      setMessage({ type: 'success', text: 'Arbitrage schedule settings saved successfully!' })
    } catch (error) {
      console.error('Error saving arbitrage schedule settings:', error)
      setMessage({ type: 'error', text: 'Failed to save schedule settings' })
    } finally {
      setSaving(false)
    }
  }

  const toggleDayOfWeek = (day: number) => {
    setSettings(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort((a, b) => a - b)
    }))
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', {
      timeZone: settings.timezone,
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  }

  const getNextRunDescription = () => {
    if (!settings.enabled) return 'Disabled'
    if (!settings.next_run) return 'Calculating...'
    
    const nextRun = new Date(settings.next_run)
    const now = new Date()
    const diffMs = nextRun.getTime() - now.getTime()
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) return 'Within the next hour'
    if (diffHours < 24) return `In ${diffHours} hours`
    
    const diffDays = Math.round(diffHours / 24)
    return `In ${diffDays} day${diffDays === 1 ? '' : 's'}`
  }

  const getSelectedStorefrontName = () => {
    if (!settings.storefront_id) return 'Select storefront...'
    const storefront = storefronts.find(s => s.id === settings.storefront_id)
    return storefront ? storefront.name : 'Unknown storefront'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600">Loading arbitrage schedule settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Automatic A2A EU Scans</h3>
          <p className="text-sm text-gray-600">Enable scheduled arbitrage opportunity scans</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={settings.enabled}
            onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      {settings.enabled && (
        <>
          {/* Scan Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <BuildingStorefrontIcon className="w-5 h-5 inline mr-2" />
              Scan Type
            </label>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="scan_type"
                  value="single"
                  checked={settings.scan_type === 'single'}
                  onChange={(e) => setSettings(prev => ({ ...prev, scan_type: e.target.value as any }))}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 focus:ring-indigo-500"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">Single Storefront</div>
                  <div className="text-sm text-gray-500">Scan one specific storefront</div>
                </div>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="scan_type"
                  value="all"
                  checked={settings.scan_type === 'all'}
                  onChange={(e) => setSettings(prev => ({ ...prev, scan_type: e.target.value as any }))}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 focus:ring-indigo-500"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">All Storefronts ({storefronts.length})</div>
                  <div className="text-sm text-gray-500">Scan all your storefronts</div>
                </div>
              </label>
            </div>
          </div>

          {/* Storefront Selection (only for single scan type) */}
          {settings.scan_type === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Storefront
              </label>
              <select
                value={settings.storefront_id || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, storefront_id: e.target.value || undefined }))}
                className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select a storefront...</option>
                {storefronts.map((storefront) => (
                  <option key={storefront.id} value={storefront.id}>
                    {storefront.name}
                  </option>
                ))}
              </select>
              {settings.scan_type === 'single' && !settings.storefront_id && (
                <p className="mt-1 text-sm text-red-600">Please select a storefront for single scan type</p>
              )}
            </div>
          )}

          {/* Frequency Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <CalendarIcon className="w-5 h-5 inline mr-2" />
              Scan Frequency
            </label>
            <div className="space-y-2">
              {FREQUENCY_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    value={option.value}
                    checked={settings.frequency === option.value}
                    onChange={(e) => setSettings(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 focus:ring-indigo-500"
                  />
                  <div className="ml-3">
                    <div className="text-sm font-medium text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-500">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Days of Week (only for weekly) */}
          {settings.frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Days of Week
              </label>
              <div className="flex gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => toggleDayOfWeek(day.value)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      settings.days_of_week.includes(day.value)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <ClockIcon className="w-5 h-5 inline mr-2" />
              Time of Day
            </label>
            <select
              value={settings.time_of_day}
              onChange={(e) => setSettings(prev => ({ ...prev, time_of_day: e.target.value }))}
              className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time.value} value={time.value}>
                  {time.label}
                </option>
              ))}
            </select>
          </div>

          {/* Timezone Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GlobeAltIcon className="w-5 h-5 inline mr-2" />
              Timezone
            </label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
              className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Status Information */}
      {settings.enabled && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-800">Schedule Status</h4>
          
          {/* How it works explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <ClockIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">How automatic scans work:</p>
                <p>The server checks every hour for due arbitrage scans. When your scheduled time arrives, the system will automatically analyze products across European marketplaces and identify profitable opportunities.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-600">Scan Type:</span>
              <div className="font-medium text-gray-900 flex items-center gap-1">
                {settings.scan_type === 'single' ? (
                  <>
                    <BuildingStorefrontIcon className="w-4 h-4" />
                    Single: {getSelectedStorefrontName()}
                  </>
                ) : (
                  <>
                    <UserGroupIcon className="w-4 h-4" />
                    All Storefronts ({storefronts.length})
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Last Run:</span>
              <div className="font-medium text-gray-900">{formatDateTime(settings.last_run || '')}</div>
            </div>
            <div>
              <span className="text-gray-600">Next Run:</span>
              <div className="font-medium text-gray-900">
                {settings.next_run ? formatDateTime(settings.next_run) : 'Calculating...'}
              </div>
              <div className="text-xs text-gray-500">{getNextRunDescription()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircleIcon className="w-5 h-5" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving || (settings.enabled && settings.scan_type === 'single' && !settings.storefront_id)}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>
    </div>
  )
}