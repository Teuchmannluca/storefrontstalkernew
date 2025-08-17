'use client'

import { ReactNode, useState } from "react"
import { cn } from "@/lib/utils"
import {
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon
} from "@heroicons/react/24/outline"

interface Column<T> {
  id: keyof T
  label: string
  sortable?: boolean
  render?: (value: any, row: T) => ReactNode
  className?: string
  width?: string
}

interface PremiumTableProps<T> {
  data: T[]
  columns: Column<T>[]
  variant?: 'default' | 'financial' | 'compact'
  density?: 'compact' | 'comfortable' | 'spacious'
  searchable?: boolean
  filterable?: boolean
  pagination?: boolean
  pageSize?: number
  className?: string
  emptyMessage?: string
  loading?: boolean
}

export function PremiumTable<T extends Record<string, any>>({
  data,
  columns,
  variant = 'default',
  density = 'comfortable',
  searchable = false,
  filterable = false,
  pagination = false,
  pageSize = 10,
  className,
  emptyMessage = "No data available",
  loading = false
}: PremiumTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<{
    key: keyof T | null
    direction: 'asc' | 'desc'
  }>({ key: null, direction: 'asc' })
  
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const handleSort = (columnId: keyof T) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === columnId && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key: columnId, direction })
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig.key) return 0
    
    const aValue = a[sortConfig.key]
    const bValue = b[sortConfig.key]
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const filteredData = searchTerm
    ? sortedData.filter(row =>
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : sortedData

  const paginatedData = pagination
    ? filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : filteredData

  const totalPages = Math.ceil(filteredData.length / pageSize)

  const densityStyles = {
    compact: 'py-2 px-3',
    comfortable: 'py-3 px-4',
    spacious: 'py-4 px-6'
  }

  const variantStyles = {
    default: 'bg-white border border-gray-200',
    financial: 'bg-gradient-to-br from-white to-gray-50 border border-gray-200',
    compact: 'bg-white border-0'
  }

  if (loading) {
    return (
      <div className={cn("rounded-xl overflow-hidden shadow-sm", variantStyles[variant], className)}>
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex space-x-4">
              {columns.map((_, j) => (
                <div key={j} className="skeleton h-6 flex-1"></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl overflow-hidden shadow-sm", variantStyles[variant], className)}>
      {/* Table Header Controls */}
      {(searchable || filterable) && (
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-4">
            {searchable && (
              <div className="relative flex-1 max-w-sm">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input pl-10"
                />
              </div>
            )}
            {filterable && (
              <button className="btn-ghost">
                <FunnelIcon className="w-4 h-4 mr-2" />
                Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.id)}
                  className={cn(
                    "text-left text-xs font-semibold text-gray-600 uppercase tracking-wider",
                    densityStyles[density],
                    column.sortable && "cursor-pointer hover:bg-gray-100 transition-colors",
                    column.className
                  )}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{column.label}</span>
                    {column.sortable && (
                      <div className="flex flex-col">
                        {sortConfig.key === column.id ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUpIcon className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ChevronDownIcon className="w-3 h-3 text-blue-600" />
                          )
                        ) : (
                          <ArrowsUpDownIcon className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr 
                  key={index} 
                  className="hover:bg-gray-50/50 transition-colors duration-150"
                >
                  {columns.map((column) => (
                    <td
                      key={String(column.id)}
                      className={cn(
                        "text-sm text-gray-900",
                        densityStyles[density],
                        column.className
                      )}
                    >
                      {column.render 
                        ? column.render(row[column.id], row)
                        : String(row[column.id] || '-')
                      }
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/30">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} results
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn-ghost px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => 
                  page === 1 || 
                  page === totalPages || 
                  Math.abs(page - currentPage) <= 1
                )
                .map((page, index, array) => (
                  <div key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-gray-400">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                        currentPage === page
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      {page}
                    </button>
                  </div>
                ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-ghost px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}