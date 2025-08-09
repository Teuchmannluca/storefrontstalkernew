'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import FrequencySelector, { FrequencyConfig } from './FrequencySelector'
import {
  ClockIcon,
  CalendarIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PlayIcon,
  BuildingStorefrontIcon
} from '@heroicons/react/24/outline'

interface ScheduleSettings {
  id?: string
  enabled: boolean
  frequency_config: FrequencyConfig
  timezone: string
  last_run?: string
  next_run?: string
}

interface ScheduleSettingsProps {
  userId?: string
}


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


export default function ScheduleSettings({ userId }: ScheduleSettingsProps) {
  const [settings, setSettings] = useState<ScheduleSettings>({
    enabled: false,
    frequency_config: {
      frequencyType: 'simple',
      frequency: 'daily',
      timeOfDay: '02:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7]
    },
    timezone: 'UTC'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (userId) {
      loadSettings()
      loadSchedulerStatus()
    }
  }, [userId])

  const loadSchedulerStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch('/api/scheduler/status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSchedulerStatus(data)
      }
    } catch (error) {
      console.error('Error loading scheduler status:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_schedule_settings')
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
          frequency_config: {
            frequencyType: data.frequency_type || 'simple',
            frequency: data.frequency || 'daily',
            hourlyInterval: data.hourly_interval,
            dailyTimes: data.daily_times,
            timeOfDay: data.time_of_day || '02:00',
            daysOfWeek: data.days_of_week || [1, 2, 3, 4, 5, 6, 7],
            businessHoursOnly: data.business_hours_only,
            businessHoursStart: data.business_hours_start,
            businessHoursEnd: data.business_hours_end,
            customIntervalHours: data.custom_interval_hours
          },
          timezone: data.timezone || 'UTC',
          last_run: data.last_run,
          next_run: data.next_run
        })
      }
    } catch (error) {
      console.error('Error loading schedule settings:', error)
      setMessage({ type: 'error', text: 'Failed to load schedule settings' })
    } finally {
      setLoading(false)
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
        frequency_type: settings.frequency_config.frequencyType,
        frequency: settings.frequency_config.frequency,
        hourly_interval: settings.frequency_config.hourlyInterval,
        daily_times: settings.frequency_config.dailyTimes,
        time_of_day: settings.frequency_config.timeOfDay,
        timezone: settings.timezone,
        days_of_week: settings.frequency_config.daysOfWeek,
        business_hours_only: settings.frequency_config.businessHoursOnly,
        business_hours_start: settings.frequency_config.businessHoursStart,
        business_hours_end: settings.frequency_config.businessHoursEnd,
        custom_interval_hours: settings.frequency_config.customIntervalHours
      }

      let result
      if (settings.id) {
        // Update existing settings
        result = await supabase
          .from('user_schedule_settings')
          .update(settingsToSave)
          .eq('id', settings.id)
          .select()
          .single()
      } else {
        // Create new settings
        result = await supabase
          .from('user_schedule_settings')
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

      // Update scheduler via API
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const response = await fetch('/api/scheduler/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            type: 'storefront',
            settings: settingsToSave
          })
        })

        if (!response.ok) {
          console.error('Failed to update scheduler')
        } else {
          await loadSchedulerStatus()
        }
      }

      setMessage({ type: 'success', text: 'Schedule settings saved and scheduler updated!' })
    } catch (error) {
      console.error('Error saving schedule settings:', error)
      setMessage({ type: 'error', text: 'Failed to save schedule settings' })
    } finally {
      setSaving(false)
    }
  }

  const triggerManualRun = async () => {
    setTriggering(true)
    setMessage(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No session')
      }

      const response = await fetch('/api/scheduler/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ type: 'storefront' })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger update')
      }

      setMessage({ type: 'success', text: 'Update triggered successfully! Check progress in a moment.' })
      
      // Reload status after a delay
      setTimeout(() => {
        loadSchedulerStatus()
      }, 2000)
    } catch (error) {
      console.error('Error triggering update:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to trigger update' })
    } finally {
      setTriggering(false)
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600">Loading schedule settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Automatic Updates</h3>
          <p className="text-sm text-gray-600">Enable scheduled storefront updates</p>
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
          {/* Frequency Configuration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <CalendarIcon className="w-5 h-5 inline mr-2" />
              Update Schedule
            </label>
            <FrequencySelector
              config={settings.frequency_config}
              onChange={(config) => setSettings(prev => ({ ...prev, frequency_config: config }))}
              showBusinessHours={true}
            />
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

      {/* Manual Trigger Button */}
      <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div>
          <h4 className="text-sm font-medium text-indigo-900">Manual Update</h4>
          <p className="text-sm text-indigo-700">Run storefront update immediately</p>
        </div>
        <button
          onClick={triggerManualRun}
          disabled={triggering || schedulerStatus?.schedules?.storefront?.status?.isRunning}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {triggering ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Triggering...
            </>
          ) : schedulerStatus?.schedules?.storefront?.status?.isRunning ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <PlayIcon className="w-5 h-5" />
              Run Now
            </>
          )}
        </button>
      </div>

      {/* Status Information */}
      {settings.enabled && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-800">Schedule Status</h4>
          
          {/* How it works explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <ClockIcon className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">How automatic updates work:</p>
                <p>The built-in scheduler runs on your server and checks for due updates based on your schedule. All storefronts will be updated automatically using the Keepa API.</p>
                {schedulerStatus?.system?.initialized && (
                  <p className="mt-1 text-xs">Scheduler Status: ✅ Active ({schedulerStatus.system.activeSchedules} schedules)</p>
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
          disabled={saving}
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