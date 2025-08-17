'use client'

import { ReactNode, ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface PremiumButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'financial' | 'destructive' | 'outline'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  loadingText?: string
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  gradient?: boolean
  ripple?: boolean
  children: ReactNode
}

const buttonVariants = {
  primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl disabled:from-gray-400 disabled:to-gray-400',
  secondary: 'bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 shadow-sm hover:shadow-md disabled:bg-gray-100 disabled:text-gray-400',
  ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-transparent',
  financial: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl disabled:from-gray-400 disabled:to-gray-400',
  destructive: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg hover:shadow-xl disabled:from-gray-400 disabled:to-gray-400',
  outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white disabled:border-gray-300 disabled:text-gray-400'
}

const buttonSizes = {
  xs: 'px-2.5 py-1.5 text-xs font-medium min-h-[28px]',
  sm: 'px-3 py-2 text-sm font-medium min-h-[36px]',
  md: 'px-4 py-2.5 text-sm font-medium min-h-[40px]',
  lg: 'px-6 py-3 text-base font-medium min-h-[48px]',
  xl: 'px-8 py-4 text-lg font-semibold min-h-[56px]'
}

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-7 h-7'
}

export const PremiumButton = forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText = 'Loading...',
    icon,
    iconPosition = 'left',
    fullWidth = false,
    gradient = false,
    ripple = true,
    children,
    className,
    disabled,
    onClick,
    ...props
  }, ref) => {
    const isDisabled = disabled || loading

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple && !isDisabled) {
        // Create ripple effect
        const button = e.currentTarget
        const rect = button.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = e.clientX - rect.left - size / 2
        const y = e.clientY - rect.top - size / 2
        
        const ripple = document.createElement('div')
        ripple.className = 'absolute rounded-full bg-white/30 pointer-events-none animate-ping'
        ripple.style.width = ripple.style.height = size + 'px'
        ripple.style.left = x + 'px'
        ripple.style.top = y + 'px'
        ripple.style.transform = 'scale(0)'
        ripple.style.animation = 'ripple 0.6s ease-out'
        
        button.appendChild(ripple)
        setTimeout(() => ripple.remove(), 600)
      }
      
      if (onClick && !isDisabled) {
        onClick(e)
      }
    }

    const baseClasses = cn(
      // Base styles
      'relative inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 overflow-hidden group',
      
      // Variant styles
      buttonVariants[variant],
      
      // Size styles
      buttonSizes[size],
      
      // Width styles
      fullWidth ? 'w-full' : '',
      
      // Disabled styles
      isDisabled ? 'cursor-not-allowed transform-none' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
      
      // Gradient enhancement
      gradient && variant === 'primary' ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600' : '',
      
      className
    )

    const iconClasses = cn(
      iconSizes[size],
      loading ? 'animate-spin' : ''
    )

    const renderIcon = () => {
      if (loading) {
        return (
          <svg className={iconClasses} fill="none" viewBox="0 0 24 24">
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 0 1 8-8V2.5a1.5 1.5 0 0 0-3 0V4a8 8 0 0 1 8 8h1.5a1.5 1.5 0 0 0 0-3H20a8 8 0 0 1-8 8v1.5a1.5 1.5 0 0 0 3 0V20a8 8 0 0 1-8-8H2.5a1.5 1.5 0 0 0 0 3H4z"
            />
          </svg>
        )
      }
      
      if (icon) {
        return <span className={iconClasses}>{icon}</span>
      }
      
      return null
    }

    const buttonContent = loading ? loadingText : children

    return (
      <button
        ref={ref}
        className={baseClasses}
        disabled={isDisabled}
        onClick={handleClick}
        {...props}
      >
        {/* Background animation layer */}
        <div className="absolute inset-0 bg-white/10 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        
        {/* Content */}
        <div className="relative flex items-center justify-center gap-2">
          {iconPosition === 'left' && renderIcon()}
          <span className="truncate">{buttonContent}</span>
          {iconPosition === 'right' && renderIcon()}
        </div>
        
        {/* Glow effect for primary buttons */}
        {variant === 'primary' && !isDisabled && (
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-xl" />
        )}
      </button>
    )
  }
)

PremiumButton.displayName = 'PremiumButton'

// Preset button components for common use cases
export const PrimaryButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="primary" {...props} />
)

export const SecondaryButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="secondary" {...props} />
)

export const GhostButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="ghost" {...props} />
)

export const FinancialButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="financial" {...props} />
)

export const DestructiveButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="destructive" {...props} />
)

export const OutlineButton = (props: Omit<PremiumButtonProps, 'variant'>) => (
  <PremiumButton variant="outline" {...props} />
)