'use client'

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface PremiumCardProps {
  children: ReactNode
  variant?: 'default' | 'elevated' | 'financial' | 'alert'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onClick?: () => void
  gradient?: boolean
}

const cardVariants = {
  default: 'card',
  elevated: 'card-elevated',
  financial: 'card-financial',
  alert: 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200'
}

const cardSizes = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  xl: 'p-10'
}

export function PremiumCard({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className,
  onClick,
  gradient = false
}: PremiumCardProps) {
  const baseStyles = cardVariants[variant]
  const sizeStyles = cardSizes[size]
  
  const gradientStyles = gradient 
    ? 'bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/30' 
    : ''

  return (
    <div 
      className={cn(
        baseStyles,
        sizeStyles,
        gradientStyles,
        onClick && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
        'animate-fade-in-up',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: ReactNode
  className?: string
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CardTitle({ children, className, size = 'md' }: CardTitleProps) {
  const sizeStyles = {
    sm: 'text-lg font-semibold',
    md: 'text-xl font-semibold',
    lg: 'text-2xl font-bold'
  }

  return (
    <h3 className={cn("text-gray-900", sizeStyles[size], className)}>
      {children}
    </h3>
  )
}

interface CardDescriptionProps {
  children: ReactNode
  className?: string
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-gray-600 mt-1", className)}>
      {children}
    </p>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn("", className)}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("mt-6 pt-4 border-t border-gray-100", className)}>
      {children}
    </div>
  )
}