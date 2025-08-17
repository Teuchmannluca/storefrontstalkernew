'use client'

import { forwardRef, ReactNode, InputHTMLAttributes, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PremiumInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  success?: string
  helperText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  showCharacterCount?: boolean
  maxLength?: number
  variant?: 'default' | 'filled' | 'outlined'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const inputVariants = {
  default: 'border-gray-300 focus:border-blue-500 focus:ring-blue-500',
  filled: 'border-0 bg-gray-100 focus:bg-white focus:ring-blue-500 focus:shadow-lg',
  outlined: 'border-2 border-gray-300 focus:border-blue-500 focus:ring-0'
}

const inputSizes = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-3 py-2.5 text-sm',
  lg: 'px-4 py-3 text-base'
}

const labelSizes = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
}

export const PremiumInput = forwardRef<HTMLInputElement, PremiumInputProps>(
  ({
    label,
    error,
    success,
    helperText,
    leftIcon,
    rightIcon,
    showCharacterCount = false,
    maxLength,
    variant = 'default',
    size = 'md',
    loading = false,
    className,
    value,
    onChange,
    onFocus,
    onBlur,
    ...props
  }, ref) => {
    const [focused, setFocused] = useState(false)
    const [hasValue, setHasValue] = useState(false)

    useEffect(() => {
      setHasValue(!!value || !!props.defaultValue)
    }, [value, props.defaultValue])

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(false)
      onBlur?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value)
      onChange?.(e)
    }

    const hasError = !!error
    const hasSuccess = !!success && !hasError
    const characterCount = typeof value === 'string' ? value.length : 0

    const containerClasses = cn(
      'relative w-full',
      className
    )

    const inputClasses = cn(
      // Base styles
      'w-full transition-all duration-200 rounded-lg font-medium placeholder:text-gray-400 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
      
      // Variant styles
      inputVariants[variant],
      
      // Size styles
      inputSizes[size],
      
      // Icon padding
      leftIcon ? 'pl-10' : '',
      rightIcon || loading ? 'pr-10' : '',
      
      // Label padding (for floating labels)
      label ? 'pt-6 pb-2' : '',
      
      // State styles
      hasError 
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50' 
        : hasSuccess 
          ? 'border-green-500 focus:border-green-500 focus:ring-green-500 bg-green-50'
          : '',
      
      // Focus styles
      'focus:outline-none focus:ring-2 focus:ring-opacity-50'
    )

    const labelClasses = cn(
      'absolute left-3 transition-all duration-200 pointer-events-none select-none font-medium',
      labelSizes[size],
      
      // Floating behavior
      focused || hasValue
        ? 'top-2 text-xs text-blue-600'
        : size === 'lg'
          ? 'top-4 text-gray-500'
          : 'top-3 text-gray-500',
      
      // Error states
      hasError
        ? focused || hasValue
          ? 'text-red-600'
          : 'text-red-500'
        : hasSuccess
          ? focused || hasValue
            ? 'text-green-600'
            : 'text-green-500'
          : ''
    )

    const iconClasses = cn(
      'absolute top-1/2 transform -translate-y-1/2 text-gray-400',
      size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
    )

    return (
      <div className={containerClasses}>
        <div className="relative">
          {/* Left Icon */}
          {leftIcon && (
            <div className={cn(iconClasses, 'left-3')}>
              {leftIcon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            className={inputClasses}
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            maxLength={maxLength}
            {...props}
          />

          {/* Floating Label */}
          {label && (
            <label className={labelClasses}>
              {label}
            </label>
          )}

          {/* Right Icon or Loading */}
          {(rightIcon || loading) && (
            <div className={cn(iconClasses, 'right-3')}>
              {loading ? (
                <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V2.5a1.5 1.5 0 0 0-3 0V4a8 8 0 0 1 8 8h1.5a1.5 1.5 0 0 0 0-3H20a8 8 0 0 1-8 8v1.5a1.5 1.5 0 0 0 3 0V20a8 8 0 0 1-8-8H2.5a1.5 1.5 0 0 0 0 3H4z" />
                </svg>
              ) : rightIcon}
            </div>
          )}

          {/* Focus ring animation */}
          <div className={cn(
            'absolute inset-0 rounded-lg transition-all duration-200 pointer-events-none',
            focused ? 'ring-2 ring-blue-500 ring-opacity-20' : ''
          )} />
        </div>

        {/* Helper text, error, success messages, character count */}
        <div className="mt-2 flex justify-between items-start">
          <div className="flex-1">
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

          {/* Character count */}
          {showCharacterCount && maxLength && (
            <p className={cn(
              'text-xs ml-2 flex-shrink-0',
              characterCount > maxLength * 0.8
                ? characterCount >= maxLength
                  ? 'text-red-600'
                  : 'text-orange-600'
                : 'text-gray-500'
            )}>
              {characterCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    )
  }
)

PremiumInput.displayName = 'PremiumInput'

// Preset input components
interface SearchInputProps extends Omit<PremiumInputProps, 'leftIcon'> {}

export const SearchInput = (props: SearchInputProps) => (
  <PremiumInput
    leftIcon={
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    }
    placeholder="Search..."
    {...props}
  />
)

interface PasswordInputProps extends Omit<PremiumInputProps, 'type' | 'rightIcon'> {}

export const PasswordInput = ({ ...props }: PasswordInputProps) => {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <PremiumInput
      type={showPassword ? 'text' : 'password'}
      rightIcon={
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showPassword ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      }
      {...props}
    />
  )
}