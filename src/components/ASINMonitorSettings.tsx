'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import FrequencySelector, { FrequencyConfig } from './FrequencySelector'
import {
  MagnifyingGlassIcon,
  BellIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  ChartBarIcon,
  CurrencyPoundIcon,
  ClockIcon
} from '@heroicons/react/24/outline'

interface ASINList {
  id: string
  name: string
  asins: string[]
  created_at: string
}

interface MonitorSettings {
  id?: string
  asin_list_id: string
  enabled: boolean
  frequency_config: FrequencyConfig
  timezone: string
  alert_on_price_drop: boolean
  alert_on_price_increase: boolean
  price_change_threshold: number
  last_run?: string
  next_run?: string
}

interface ASINMonitorSettingsProps {
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
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' }
]

export default function ASINMonitorSettings({ userId }: ASINMonitorSettingsProps) {
  const [asinLists, setAsinLists] = useState<ASINList[]>([])
  const [monitorSettings, setMonitorSettings] = useState<Map<string, MonitorSettings>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [expandedList, setExpandedList] = useState<string | null>(null)

  useEffect(() => {
    if (userId) {
      loadData()
    }
  }, [userId])

  const loadData = async () => {
    try {
      // Load ASIN lists
      const { data: lists, error: listsError } = await supabase
        .from('asin_lists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (listsError) throw listsError

      setAsinLists(lists || [])

      // Load monitor settings for each list
      const { data: settings, error: settingsError } = await supabase
        .from('user_asin_monitor_settings')
        .select('*')
        .eq('user_id', userId)

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError
      }

      // Map settings by list ID
      const settingsMap = new Map<string, MonitorSettings>()
      
      lists?.forEach((list: ASINList) => {
        const existingSetting = settings?.find((s: any) => s.asin_list_id === list.id)
        
        if (existingSetting) {
          settingsMap.set(list.id, {
            id: existingSetting.id,
            asin_list_id: list.id,
            enabled: existingSetting.enabled,
            frequency_config: {
              frequencyType: existingSetting.frequency_type || 'simple',
              frequency: existingSetting.frequency || 'daily',
              hourlyInterval: existingSetting.hourly_interval,
              dailyTimes: existingSetting.daily_times,
              timeOfDay: existingSetting.time_of_day || '09:00',
              daysOfWeek: existingSetting.days_of_week || [1, 2, 3, 4, 5, 6, 7],
              businessHoursOnly: existingSetting.business_hours_only,
              businessHoursStart: existingSetting.business_hours_start,
              businessHoursEnd: existingSetting.business_hours_end,
              customIntervalHours: existingSetting.custom_interval_hours
            },
            timezone: existingSetting.timezone || 'UTC',
            alert_on_price_drop: existingSetting.alert_on_price_drop ?? true,
            alert_on_price_increase: existingSetting.alert_on_price_increase ?? false,
            price_change_threshold: existingSetting.price_change_threshold || 5,
            last_run: existingSetting.last_run,
            next_run: existingSetting.next_run
          })
        } else {
          // Default settings for lists without monitoring
          settingsMap.set(list.id, {
            asin_list_id: list.id,
            enabled: false,
            frequency_config: {
              frequencyType: 'simple',
              frequency: 'daily',
              timeOfDay: '09:00',
              daysOfWeek: [1, 2, 3, 4, 5, 6, 7]
            },
            timezone: 'UTC',
            alert_on_price_drop: true,
            alert_on_price_increase: false,
            price_change_threshold: 5
          })
        }
      })

      setMonitorSettings(settingsMap)
    } catch (error) {
      console.error('Error loading ASIN monitor settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async (listId: string) => {
    if (!userId) return

    setSaving(listId)
    setMessage(null)

    try {
      const settings = monitorSettings.get(listId)
      if (!settings) return

      const dataToSave = {
        user_id: userId,
        asin_list_id: listId,
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
        custom_interval_hours: settings.frequency_config.customIntervalHours,
        alert_on_price_drop: settings.alert_on_price_drop,
        alert_on_price_increase: settings.alert_on_price_increase,
        price_change_threshold: settings.price_change_threshold
      }

      let result
      if (settings.id) {
        // Update existing
        result = await supabase
          .from('user_asin_monitor_settings')
          .update(dataToSave)
          .eq('id', settings.id)
          .select()
          .single()
      } else {
        // Create new
        result = await supabase
          .from('user_asin_monitor_settings')
          .insert(dataToSave)
          .select()
          .single()
      }

      if (result.error) throw result.error

      // Update local state with returned data
      const updatedSettings = { ...settings, id: result.data.id }
      const newMap = new Map(monitorSettings)
      newMap.set(listId, updatedSettings)
      setMonitorSettings(newMap)

      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      console.error('Error saving monitor settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(null)
    }
  }

  const updateSettings = (listId: string, updates: Partial<MonitorSettings>) => {
    const current = monitorSettings.get(listId)
    if (current) {
      const newMap = new Map(monitorSettings)
      newMap.set(listId, { ...current, ...updates })
      setMonitorSettings(newMap)
    }
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600">Loading ASIN monitoring settings...</span>
      </div>
    )
  }

  if (asinLists.length === 0) {
    return (
      <div className="text-center py-12">
        <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No ASIN Lists</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create ASIN lists in the ASIN Checker to enable monitoring.
        </p>
        <div className="mt-6">
          <a
            href="/dashboard/asin-checker"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Go to ASIN Checker
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">ASIN List Monitoring</h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure automatic price monitoring for your saved ASIN lists
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ChartBarIcon className="w-4 h-4" />
          <span>{asinLists.length} lists available</span>
        </div>
      </div>

      {/* ASIN Lists */}
      <div className="space-y-4">
        {asinLists.map((list) => {
          const settings = monitorSettings.get(list.id) || {
            asin_list_id: list.id,
            enabled: false,
            frequency_config: {
              frequencyType: 'simple',
              frequency: 'daily',
              timeOfDay: '09:00',
              daysOfWeek: [1, 2, 3, 4, 5, 6, 7]
            },
            timezone: 'UTC',
            alert_on_price_drop: true,
            alert_on_price_increase: false,
            price_change_threshold: 5
          }
          const isExpanded = expandedList === list.id

          return (
            <div key={list.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* List Header */}
              <div 
                className="px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setExpandedList(isExpanded ? null : list.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">{list.name}</h4>
                      <p className="text-sm text-gray-500">
                        {list.asins.length} ASINs • Created {new Date(list.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {settings.enabled && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Monitoring Active
                      </div>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Expanded Settings */}
              {isExpanded && (
                <div className="p-6 space-y-6 border-t border-gray-200">
                  {/* Enable Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Enable Monitoring</label>
                      <p className="text-sm text-gray-500">Track price changes for this list</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => updateSettings(list.id, { enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {settings.enabled && (
                    <>
                      {/* Frequency Configuration */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Check Frequency
                        </label>
                        <FrequencySelector
                          config={settings.frequency_config}
                          onChange={(config) => updateSettings(list.id, { 
                            frequency_config: config 
                          })}
                          showBusinessHours={true}
                        />
                      </div>

                      {/* Timezone */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Timezone
                        </label>
                        <select
                          value={settings.timezone}
                          onChange={(e) => updateSettings(list.id, { timezone: e.target.value })}
                          className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <option key={tz.value} value={tz.value}>
                              {tz.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Alert Settings */}
                      <div className="bg-indigo-50 rounded-lg p-4 space-y-4">
                        <h5 className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                          <BellIcon className="w-4 h-4" />
                          Alert Settings
                        </h5>
                        
                        <div className="space-y-3">
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={settings.alert_on_price_drop}
                              onChange={(e) => updateSettings(list.id, { 
                                alert_on_price_drop: e.target.checked 
                              })}
                              className="w-4 h-4 text-indigo-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Alert on price drops</span>
                          </label>
                          
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={settings.alert_on_price_increase}
                              onChange={(e) => updateSettings(list.id, { 
                                alert_on_price_increase: e.target.checked 
                              })}
                              className="w-4 h-4 text-indigo-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Alert on price increases</span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Price Change Threshold (%)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={settings.price_change_threshold}
                            onChange={(e) => updateSettings(list.id, { 
                              price_change_threshold: parseFloat(e.target.value) || 5 
                            })}
                            className="block w-32 px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Only alert when price changes by more than {settings.price_change_threshold}%
                          </p>
                        </div>
                      </div>

                      {/* Status Information */}
                      {(settings.last_run || settings.next_run) && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Last Check:</span>
                              <div className="font-medium text-gray-900">
                                {formatDateTime(settings.last_run || '')}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-600">Next Check:</span>
                              <div className="font-medium text-gray-900">
                                {settings.next_run ? formatDateTime(settings.next_run) : 'Calculating...'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => saveSettings(list.id)}
                      disabled={saving === list.id}
                      className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving === list.id ? (
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
              )}
            </div>
          )
        })}
      </div>

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
    </div>
  )
}