'use client'

import { ReactNode } from "react"
import { PremiumCard, CardHeader, CardTitle, CardDescription, CardContent } from "./premium-card"
import { cn } from "@/lib/utils"

interface ChartData {
  label: string
  value: number
  color?: string
}

interface ChartContainerProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
  loading?: boolean
}

export function ChartContainer({ 
  title, 
  description, 
  children, 
  className,
  loading = false
}: ChartContainerProps) {
  if (loading) {
    return (
      <PremiumCard variant="financial" className={className}>
        <CardHeader>
          <div className="skeleton w-32 h-6"></div>
          {description && <div className="skeleton w-48 h-4 mt-2"></div>}
        </CardHeader>
        <CardContent>
          <div className="skeleton h-64 w-full"></div>
        </CardContent>
      </PremiumCard>
    )
  }

  return (
    <PremiumCard variant="financial" className={className}>
      <CardHeader>
        <div>
          <CardTitle size="md">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </PremiumCard>
  )
}

interface BarChartProps {
  data: ChartData[]
  height?: number
  className?: string
  showValues?: boolean
}

export function SimpleBarChart({ 
  data, 
  height = 200, 
  className,
  showValues = true 
}: BarChartProps) {
  const maxValue = Math.max(...data.map(d => d.value))
  
  return (
    <div className={cn("space-y-4", className)} style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * (height - 60)
        const color = item.color || `hsl(${(index * 137.5) % 360}, 70%, 50%)`
        
        return (
          <div key={item.label} className="flex items-end gap-3">
            <div className="flex-1 flex items-end gap-2">
              <span className="text-sm font-medium text-gray-600 w-20 text-right">
                {item.label}
              </span>
              <div className="flex-1 relative">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-r-md transition-all duration-500 ease-out"
                  style={{ 
                    height: '24px',
                    width: `${(item.value / maxValue) * 100}%`,
                    backgroundColor: color
                  }}
                />
                {showValues && (
                  <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs font-medium text-white">
                    {item.value}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface LineChartProps {
  data: { label: string; value: number }[]
  height?: number
  className?: string
  color?: string
}

export function SimpleLineChart({ 
  data, 
  height = 200, 
  className,
  color = '#3b82f6'
}: LineChartProps) {
  const maxValue = Math.max(...data.map(d => d.value))
  const minValue = Math.min(...data.map(d => d.value))
  const range = maxValue - minValue || 1
  
  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((item.value - minValue) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <svg 
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Area fill */}
        <polygon
          fill="url(#lineGradient)"
          points={`0,100 ${points} 100,100`}
        />
        
        {/* Line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          points={points}
          className="animate-fade-in-up"
        />
        
        {/* Data points */}
        {data.map((item, index) => {
          const x = (index / (data.length - 1)) * 100
          const y = 100 - ((item.value - minValue) / range) * 100
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="1"
              fill={color}
              className="animate-scale-in"
              style={{ animationDelay: `${index * 100}ms` }}
            />
          )
        })}
      </svg>
      
      {/* Labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500 mt-2">
        {data.map((item, index) => {
          if (index % Math.ceil(data.length / 5) === 0 || index === data.length - 1) {
            return (
              <span key={index} className="transform -translate-x-1/2">
                {item.label}
              </span>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

interface DonutChartProps {
  data: ChartData[]
  size?: number
  thickness?: number
  className?: string
  showLegend?: boolean
}

export function SimpleDonutChart({ 
  data, 
  size = 200, 
  thickness = 20,
  className,
  showLegend = true 
}: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const center = size / 2
  const radius = center - thickness / 2
  const circumference = 2 * Math.PI * radius
  
  let currentAngle = 0
  
  const segments = data.map((item, index) => {
    const percentage = (item.value / total) * 100
    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`
    const strokeDashoffset = -currentAngle * (circumference / 100)
    const color = item.color || `hsl(${(index * 137.5) % 360}, 70%, 50%)`
    
    currentAngle += percentage
    
    return {
      ...item,
      percentage,
      strokeDasharray,
      strokeDashoffset,
      color
    }
  })

  return (
    <div className={cn("flex items-center gap-6", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {segments.map((segment, index) => (
            <circle
              key={index}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={segment.strokeDasharray}
              strokeDashoffset={segment.strokeDashoffset}
              strokeLinecap="round"
              className="animate-scale-in transition-all duration-500"
              style={{ animationDelay: `${index * 200}ms` }}
            />
          ))}
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-sm text-gray-500">Total</span>
        </div>
      </div>
      
      {showLegend && (
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-sm text-gray-600">{segment.label}</span>
              <span className="text-sm font-medium text-gray-900">
                {segment.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface MetricTrendProps {
  value: number
  previousValue: number
  label: string
  format?: (value: number) => string
  className?: string
}

export function MetricTrend({ 
  value, 
  previousValue, 
  label, 
  format = (v) => v.toString(),
  className 
}: MetricTrendProps) {
  const change = value - previousValue
  const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0
  const isPositive = change > 0
  const isNeutral = change === 0
  
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {format(value)}
        </span>
        <div className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
          isNeutral 
            ? "bg-gray-100 text-gray-600"
            : isPositive 
              ? "bg-green-100 text-green-600" 
              : "bg-red-100 text-red-600"
        )}>
          <span>{isPositive ? '+' : ''}{changePercent.toFixed(1)}%</span>
        </div>
      </div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  )
}