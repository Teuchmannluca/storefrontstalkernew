'use client'

import { useState, useEffect } from 'react'
import {
  ClockIcon,
  CalendarIcon,
  ArrowPathIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'

export interface FrequencyConfig {
  frequencyType: 'simple' | 'hourly' | 'multiple_daily' | 'custom'
  frequency: 'daily' | 'every_2_days' | 'weekly'
  hourlyInterval?: number
  dailyTimes?: string[]
  timeOfDay: string
  daysOfWeek: number[]
  businessHoursOnly?: boolean
  businessHoursStart?: string
  businessHoursEnd?: string
  customIntervalHours?: number
}

interface FrequencySelectorProps {
  config: FrequencyConfig
  onChange: (config: FrequencyConfig) => void
  showBusinessHours?: boolean
}

const FREQUENCY_TYPES = [
  { 
    value: 'simple', 
    label: 'Simple Schedule', 
    icon: CalendarIcon,
    description: 'Daily, every 2 days, or weekly'
  },
  { 
    value: 'hourly', 
    label: 'Hourly Schedule', 
    icon: ClockIcon,
    description: 'Run every X hours'
  },
  { 
    value: 'multiple_daily', 
    label: 'Multiple Times Daily', 
    icon: ArrowPathIcon,
    description: 'Run at specific times each day'
  },
  { 
    value: 'custom', 
    label: 'Custom Interval', 
    icon: Cog6ToothIcon,
    description: 'Custom hour interval'
  }
]

const HOURLY_OPTIONS = [
  { value: 1, label: 'Every hour' },
  { value: 2, label: 'Every 2 hours' },
  { value: 3, label: 'Every 3 hours' },
  { value: 4, label: 'Every 4 hours' },
  { value: 6, label: 'Every 6 hours' },
  { value: 8, label: 'Every 8 hours' },
  { value: 12, label: 'Every 12 hours' }
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

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0')
  const time12 = i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
  return { value: `${hour}:00`, label: `${hour}:00 (${time12})` }
})

export default function FrequencySelector({ 
  config, 
  onChange, 
  showBusinessHours = true 
}: FrequencySelectorProps) {
  const [dailyTimeSlots, setDailyTimeSlots] = useState<string[]>(
    config.dailyTimes || ['09:00', '15:00']
  )

  const handleFrequencyTypeChange = (type: string) => {
    const newConfig: FrequencyConfig = {
      ...config,
      frequencyType: type as FrequencyConfig['frequencyType']
    }

    // Set defaults based on type
    if (type === 'hourly') {
      newConfig.hourlyInterval = 4
    } else if (type === 'multiple_daily') {
      newConfig.dailyTimes = ['09:00', '15:00']
    } else if (type === 'custom') {
      newConfig.customIntervalHours = 24
    }

    onChange(newConfig)
  }

  const addDailyTimeSlot = () => {
    const newSlots = [...dailyTimeSlots, '12:00']
    setDailyTimeSlots(newSlots)
    onChange({
      ...config,
      dailyTimes: newSlots
    })
  }

  const removeDailyTimeSlot = (index: number) => {
    const newSlots = dailyTimeSlots.filter((_, i) => i !== index)
    setDailyTimeSlots(newSlots)
    onChange({
      ...config,
      dailyTimes: newSlots
    })
  }

  const updateDailyTimeSlot = (index: number, time: string) => {
    const newSlots = [...dailyTimeSlots]
    newSlots[index] = time
    setDailyTimeSlots(newSlots)
    onChange({
      ...config,
      dailyTimes: newSlots
    })
  }

  const toggleDayOfWeek = (day: number) => {
    const newDays = config.daysOfWeek.includes(day)
      ? config.daysOfWeek.filter(d => d !== day)
      : [...config.daysOfWeek, day].sort((a, b) => a - b)
    
    onChange({
      ...config,
      daysOfWeek: newDays
    })
  }

  return (
    <div className="space-y-6">
      {/* Frequency Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Schedule Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          {FREQUENCY_TYPES.map((type) => {
            const Icon = type.icon
            const isSelected = config.frequencyType === type.value
            return (
              <button
                key={type.value}
                onClick={() => handleFrequencyTypeChange(type.value)}
                className={`relative rounded-lg border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 ${
                    isSelected ? 'text-indigo-600' : 'text-gray-400'
                  }`} />
                  <div className="flex-1">
                    <div className={`font-medium ${
                      isSelected ? 'text-indigo-900' : 'text-gray-900'
                    }`}>
                      {type.label}
                    </div>
                    <div className={`text-sm mt-1 ${
                      isSelected ? 'text-indigo-700' : 'text-gray-500'
                    }`}>
                      {type.description}
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Simple Schedule Options */}
      {config.frequencyType === 'simple' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Frequency
            </label>
            <div className="space-y-2">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="daily"
                  checked={config.frequency === 'daily'}
                  onChange={(e) => onChange({ ...config, frequency: 'daily' })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">Daily</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="every_2_days"
                  checked={config.frequency === 'every_2_days'}
                  onChange={(e) => onChange({ ...config, frequency: 'every_2_days' })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">Every 2 days</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="weekly"
                  checked={config.frequency === 'weekly'}
                  onChange={(e) => onChange({ ...config, frequency: 'weekly' })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">Weekly</span>
              </label>
            </div>
          </div>

          {config.frequency === 'weekly' && (
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
                      config.daysOfWeek.includes(day.value)
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time of Day
            </label>
            <select
              value={config.timeOfDay}
              onChange={(e) => onChange({ ...config, timeOfDay: e.target.value })}
              className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time.value} value={time.value}>
                  {time.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Hourly Schedule Options */}
      {config.frequencyType === 'hourly' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Run Interval
          </label>
          <div className="space-y-2">
            {HOURLY_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value={option.value}
                  checked={config.hourlyInterval === option.value}
                  onChange={() => onChange({ ...config, hourlyInterval: option.value })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Multiple Daily Times */}
      {config.frequencyType === 'multiple_daily' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Daily Run Times
          </label>
          <div className="space-y-2">
            {dailyTimeSlots.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={time}
                  onChange={(e) => updateDailyTimeSlot(index, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  {TIME_OPTIONS.map((timeOpt) => (
                    <option key={timeOpt.value} value={timeOpt.value}>
                      {timeOpt.label}
                    </option>
                  ))}
                </select>
                {dailyTimeSlots.length > 1 && (
                  <button
                    onClick={() => removeDailyTimeSlot(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {dailyTimeSlots.length < 24 && (
              <button
                onClick={addDailyTimeSlot}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Time Slot
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Interval */}
      {config.frequencyType === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Custom Interval (hours)
          </label>
          <input
            type="number"
            min="1"
            max="168"
            value={config.customIntervalHours || 24}
            onChange={(e) => onChange({ 
              ...config, 
              customIntervalHours: parseInt(e.target.value) || 24 
            })}
            className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            Run every {config.customIntervalHours || 24} hours
          </p>
        </div>
      )}

      {/* Business Hours Option */}
      {showBusinessHours && (config.frequencyType === 'hourly' || config.frequencyType === 'multiple_daily') && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">Business Hours Only</label>
              <p className="text-xs text-gray-500">Only run during specified hours</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.businessHoursOnly || false}
                onChange={(e) => onChange({ 
                  ...config, 
                  businessHoursOnly: e.target.checked 
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {config.businessHoursOnly && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                <select
                  value={config.businessHoursStart || '09:00'}
                  onChange={(e) => onChange({ 
                    ...config, 
                    businessHoursStart: e.target.value 
                  })}
                  className="block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                >
                  {TIME_OPTIONS.slice(0, 20).map((time) => (
                    <option key={time.value} value={time.value}>
                      {time.label.split(' (')[0]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                <select
                  value={config.businessHoursEnd || '17:00'}
                  onChange={(e) => onChange({ 
                    ...config, 
                    businessHoursEnd: e.target.value 
                  })}
                  className="block w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                >
                  {TIME_OPTIONS.slice(4).map((time) => (
                    <option key={time.value} value={time.value}>
                      {time.label.split(' (')[0]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}