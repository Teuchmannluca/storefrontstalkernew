'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  animate?: boolean
  style?: React.CSSProperties
}

export function Skeleton({ className, animate = true, style }: SkeletonProps) {
  return (
    <div 
      className={cn(
        'bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded',
        animate && 'animate-pulse',
        className
      )}
      style={{
        backgroundSize: '200% 100%',
        animation: animate ? 'shimmer 1.5s infinite' : undefined,
        ...style
      }}
    />
  )
}

// Pre-built skeleton components for common UI patterns

export function CardSkeleton({ animate = true }: { animate?: boolean }) {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" animate={animate} />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" animate={animate} />
          <Skeleton className="h-3 w-1/2" animate={animate} />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" animate={animate} />
        <Skeleton className="h-4 w-5/6" animate={animate} />
        <Skeleton className="h-4 w-4/6" animate={animate} />
      </div>
    </div>
  )
}

export function TableSkeleton({ 
  rows = 5, 
  columns = 4, 
  animate = true 
}: { 
  rows?: number
  columns?: number
  animate?: boolean 
}) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-4 w-full" animate={animate} />
        ))}
      </div>
      
      {/* Separator */}
      <Skeleton className="h-px w-full" animate={animate} />
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={`row-${rowIndex}`} 
          className="grid gap-4" 
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={`cell-${rowIndex}-${colIndex}`} 
              className={cn(
                "h-4",
                colIndex === 0 ? "w-4/5" : colIndex === columns - 1 ? "w-3/5" : "w-full"
              )} 
              animate={animate} 
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function KPICardSkeleton({ animate = true }: { animate?: boolean }) {
  return (
    <div className="card-financial p-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-10 w-10 rounded-xl" animate={animate} />
        <Skeleton className="h-6 w-16 rounded-lg" animate={animate} />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" animate={animate} />
        <Skeleton className="h-8 w-32" animate={animate} />
        <Skeleton className="h-3 w-28" animate={animate} />
      </div>
    </div>
  )
}

export function ChartSkeleton({ 
  type = 'line',
  animate = true 
}: { 
  type?: 'line' | 'bar' | 'donut'
  animate?: boolean 
}) {
  if (type === 'donut') {
    return (
      <div className="flex items-center justify-center space-x-6 p-6">
        <div className="relative">
          <Skeleton className="h-32 w-32 rounded-full" animate={animate} />
          <div className="absolute inset-6 bg-white rounded-full" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <Skeleton className="h-3 w-3 rounded-full" animate={animate} />
              <Skeleton className="h-3 w-20" animate={animate} />
              <Skeleton className="h-3 w-12" animate={animate} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'bar') {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-end space-x-2">
            <Skeleton className="h-4 w-20" animate={animate} />
            <Skeleton 
              className={`w-full rounded-r-md`} 
              style={{ height: `${Math.random() * 40 + 20}px` }}
              animate={animate} 
            />
          </div>
        ))}
      </div>
    )
  }

  // Line chart
  return (
    <div className="p-6">
      <div className="relative h-64 w-full">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" animate={animate} />
          ))}
        </div>
        
        {/* Chart area */}
        <div className="ml-12 h-full">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-px w-full" animate={animate} />
            ))}
          </div>
          
          {/* Chart line simulation */}
          <div className="relative h-full">
            <svg className="w-full h-full">
              <defs>
                <linearGradient id="skeleton-gradient">
                  <stop offset="0%" stopColor="rgb(229, 231, 235)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
              <path
                d="M0,200 Q50,150 100,180 T200,120 T300,160 T400,100"
                stroke="rgb(209, 213, 219)"
                strokeWidth="2"
                fill="url(#skeleton-gradient)"
                className={animate ? 'animate-pulse' : ''}
              />
            </svg>
          </div>
        </div>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-12 right-0 flex justify-between mt-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" animate={animate} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProfileSkeleton({ animate = true }: { animate?: boolean }) {
  return (
    <div className="flex items-center space-x-3">
      <Skeleton className="h-10 w-10 rounded-xl" animate={animate} />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" animate={animate} />
        <Skeleton className="h-3 w-16" animate={animate} />
      </div>
    </div>
  )
}

export function ListSkeleton({ 
  items = 5, 
  showAvatar = true,
  animate = true 
}: { 
  items?: number
  showAvatar?: boolean
  animate?: boolean 
}) {
  return (
    <div className="space-y-4">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 rounded-lg border border-gray-200">
          {showAvatar && (
            <Skeleton className="h-12 w-12 rounded-lg" animate={animate} />
          )}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" animate={animate} />
            <Skeleton className="h-3 w-1/2" animate={animate} />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" animate={animate} />
        </div>
      ))}
    </div>
  )
}

export function FormSkeleton({ 
  fields = 4, 
  animate = true 
}: { 
  fields?: number
  animate?: boolean 
}) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" animate={animate} />
          <Skeleton className="h-10 w-full rounded-lg" animate={animate} />
          <Skeleton className="h-3 w-48" animate={animate} />
        </div>
      ))}
      
      <div className="flex justify-end space-x-3 pt-6">
        <Skeleton className="h-10 w-20 rounded-lg" animate={animate} />
        <Skeleton className="h-10 w-24 rounded-lg" animate={animate} />
      </div>
    </div>
  )
}

// Full page skeletons for different page types
export function DashboardSkeleton({ animate = true }: { animate?: boolean }) {
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" animate={animate} />
        <Skeleton className="h-4 w-96" animate={animate} />
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <KPICardSkeleton key={i} animate={animate} />
        ))}
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card">
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" animate={animate} />
            <ChartSkeleton type="line" animate={animate} />
          </div>
        </div>
        <div className="card">
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" animate={animate} />
            <ChartSkeleton type="bar" animate={animate} />
          </div>
        </div>
      </div>
    </div>
  )
}