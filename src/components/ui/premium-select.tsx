'use client'

import { Fragment, useState, ReactNode } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

interface Option {
  id: string | number
  label: string
  value: any
  disabled?: boolean
  icon?: ReactNode
  description?: string
}

interface PremiumSelectProps {
  options: Option[]
  value?: Option | Option[]
  onChange: (value: Option | Option[]) => void
  placeholder?: string
  label?: string
  error?: string
  success?: string
  helperText?: string
  multiple?: boolean
  searchable?: boolean
  disabled?: boolean
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'filled' | 'outlined'
  className?: string
  maxHeight?: string
}

const selectVariants = {
  default: 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white',
  filled: 'border-0 bg-gray-100 focus:bg-white focus:ring-blue-500 focus:shadow-lg',
  outlined: 'border-2 border-gray-300 focus:border-blue-500 focus:ring-0 bg-white'
}

const selectSizes = {
  sm: 'px-3 py-2 text-sm min-h-[36px]',
  md: 'px-3 py-2.5 text-sm min-h-[40px]',
  lg: 'px-4 py-3 text-base min-h-[48px]'
}

export function PremiumSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  label,
  error,
  success,
  helperText,
  multiple = false,
  searchable = false,
  disabled = false,
  loading = false,
  size = 'md',
  variant = 'default',
  className,
  maxHeight = 'max-h-60'
}: PremiumSelectProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const hasError = !!error
  const hasSuccess = !!success && !hasError

  const filteredOptions = searchable && searchQuery
    ? options.filter(option =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options

  const getDisplayValue = () => {
    if (!value) return placeholder

    if (multiple && Array.isArray(value)) {
      if (value.length === 0) return placeholder
      if (value.length === 1) return value[0].label
      return `${value.length} selected`
    }

    if (!Array.isArray(value)) {
      return value.label
    }

    return placeholder
  }

  const selectClasses = cn(
    // Base styles
    'relative w-full cursor-pointer rounded-lg font-medium text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50',
    
    // Variant styles
    selectVariants[variant],
    
    // Size styles
    selectSizes[size],
    
    // State styles
    hasError 
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50' 
      : hasSuccess 
        ? 'border-green-500 focus:border-green-500 focus:ring-green-500 bg-green-50'
        : '',
    
    // Disabled styles
    disabled ? 'cursor-not-allowed bg-gray-50 text-gray-500' : '',
    
    className
  )

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      <Listbox
        value={value}
        onChange={onChange}
        multiple={multiple}
        disabled={disabled || loading}
      >
        <div className="relative">
          <Listbox.Button className={selectClasses}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V2.5a1.5 1.5 0 0 0-3 0V4a8 8 0 0 1 8 8h1.5a1.5 1.5 0 0 0 0-3H20a8 8 0 0 1-8 8v1.5a1.5 1.5 0 0 0 3 0V20a8 8 0 0 1-8-8H2.5a1.5 1.5 0 0 0 0 3H4z" />
                    </svg>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                ) : (
                  <>
                    {/* Selected value icon */}
                    {value && !Array.isArray(value) && value.icon && (
                      <span className="flex-shrink-0 w-5 h-5">
                        {value.icon}
                      </span>
                    )}
                    
                    {/* Display value */}
                    <span className={cn(
                      'block truncate',
                      !value || (Array.isArray(value) && value.length === 0) 
                        ? 'text-gray-500' 
                        : 'text-gray-900'
                    )}>
                      {getDisplayValue()}
                    </span>
                  </>
                )}
              </div>

              {/* Chevron */}
              <ChevronUpDownIcon 
                className={cn(
                  'h-5 w-5 flex-shrink-0 transition-transform duration-200',
                  disabled ? 'text-gray-400' : 'text-gray-500'
                )} 
              />
            </div>
          </Listbox.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Listbox.Options 
              className={cn(
                'absolute z-10 mt-2 w-full bg-white shadow-xl rounded-xl border border-gray-200 py-2 text-base focus:outline-none overflow-hidden',
                maxHeight
              )}
            >
              {/* Search input */}
              {searchable && (
                <div className="px-3 pb-2 border-b border-gray-100">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Search options..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Options list */}
              <div className={cn('overflow-auto', maxHeight)}>
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    {searchQuery ? 'No options found' : 'No options available'}
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <Listbox.Option
                      key={option.id}
                      value={option}
                      disabled={option.disabled}
                      className={({ active, selected }) =>
                        cn(
                          'relative cursor-pointer select-none py-3 px-3 mx-2 rounded-lg transition-all duration-150',
                          active 
                            ? 'bg-blue-50 text-blue-900' 
                            : 'text-gray-900',
                          selected && 'bg-blue-100 text-blue-900 font-medium',
                          option.disabled && 'cursor-not-allowed text-gray-400'
                        )
                      }
                    >
                      {({ selected, active }) => (
                        <div className="flex items-center gap-3">
                          {/* Option icon */}
                          {option.icon && (
                            <span className={cn(
                              'flex-shrink-0 w-5 h-5',
                              active ? 'text-blue-600' : 'text-gray-500'
                            )}>
                              {option.icon}
                            </span>
                          )}

                          {/* Option content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className={cn(
                                'block truncate',
                                selected ? 'font-semibold' : 'font-normal'
                              )}>
                                {option.label}
                              </span>

                              {/* Check icon for selected */}
                              {selected && (
                                <CheckIcon 
                                  className="h-5 w-5 text-blue-600 flex-shrink-0" 
                                />
                              )}
                            </div>

                            {/* Option description */}
                            {option.description && (
                              <p className="text-sm text-gray-500 truncate mt-1">
                                {option.description}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </Listbox.Option>
                  ))
                )}
              </div>
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>

      {/* Helper text, error, success messages */}
      <div className="mt-2">
        {error && (
          <p className="text-sm text-red-600 animate-fade-in-up flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        {success && !error && (
          <p className="text-sm text-green-600 animate-fade-in-up flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {success}
          </p>
        )}
        {helperText && !error && !success && (
          <p className="text-sm text-gray-600">{helperText}</p>
        )}
      </div>
    </div>
  )
}

// Preset select components
interface SimpleSelectProps extends Omit<PremiumSelectProps, 'options'> {
  options: string[] | { label: string; value: any }[]
}

export function SimpleSelect({ options, ...props }: SimpleSelectProps) {
  const formattedOptions = options.map((option, index) => 
    typeof option === 'string' 
      ? { id: index, label: option, value: option }
      : { id: index, label: option.label, value: option.value }
  )

  return <PremiumSelect options={formattedOptions} {...props} />
}

// Status select with colored indicators
interface StatusSelectProps extends Omit<PremiumSelectProps, 'options'> {
  statuses: Array<{
    label: string
    value: string
    color: 'green' | 'red' | 'yellow' | 'blue' | 'gray'
  }>
}

export function StatusSelect({ statuses, ...props }: StatusSelectProps) {
  const colorMap = {
    green: 'bg-green-500',
    red: 'bg-red-500', 
    yellow: 'bg-yellow-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-500'
  }

  const formattedOptions = statuses.map((status, index) => ({
    id: index,
    label: status.label,
    value: status.value,
    icon: <div className={cn('w-3 h-3 rounded-full', colorMap[status.color])} />
  }))

  return <PremiumSelect options={formattedOptions} {...props} />
}