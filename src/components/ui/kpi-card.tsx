'use client'

import { ReactNode } from "react"
import { PremiumCard, CardContent } from "./premium-card"
import { cn } from "@/lib/utils"
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  MinusIcon 
} from "@heroicons/react/24/outline"

interface KPICardProps {
  title: string
  value: string | number
  change?: number
  changeType?: 'percentage' | 'absolute'
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
  description?: string
  className?: string
  loading?: boolean
}

export function KPICard({
  title,
  value,
  change,
  changeType = 'percentage',
  trend,
  icon,
  description,
  className,
  loading = false
}: KPICardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-600 bg-green-50'
      case 'down':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return <ArrowUpIcon className="w-4 h-4" />
      case 'down':
        return <ArrowDownIcon className="w-4 h-4" />
      default:
        return <MinusIcon className="w-4 h-4" />
    }
  }

  const formatChange = () => {
    if (change === undefined) return null
    const prefix = trend === 'up' ? '+' : trend === 'down' ? '-' : ''
    const suffix = changeType === 'percentage' ? '%' : ''
    return `${prefix}${Math.abs(change)}${suffix}`
  }

  if (loading) {
    return (
      <PremiumCard variant="financial" className={className}>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="skeleton w-8 h-8 rounded-xl"></div>
            <div className="skeleton w-16 h-6 rounded"></div>
          </div>
          <div className="space-y-2">
            <div className="skeleton w-24 h-4 rounded"></div>
            <div className="skeleton w-32 h-8 rounded"></div>
          </div>
        </CardContent>
      </PremiumCard>
    )
  }

  return (
    <PremiumCard variant="financial" className={cn("hover:shadow-lg transition-all duration-300", className)}>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          {icon && (
            <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
              {icon}
            </div>
          )}
          {change !== undefined && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium",
              getTrendColor()
            )}>
              {getTrendIcon()}
              <span>{formatChange()}</span>
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {change !== undefined && (
              <span className="text-sm text-gray-500">vs last period</span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-500 mt-2">{description}</p>
          )}
        </div>
      </CardContent>
    </PremiumCard>
  )
}

interface KPIGridProps {
  children: ReactNode
  className?: string
  columns?: 1 | 2 | 3 | 4
}

export function KPIGrid({ children, className, columns = 4 }: KPIGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  }

  return (
    <div className={cn(
      "grid gap-6",
      gridCols[columns],
      className
    )}>
      {children}
    </div>
  )
}