'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  StarIcon,
  TrashIcon,
  PencilIcon,
  PlayIcon,
  DocumentDuplicateIcon,
  PlusIcon,
  FolderIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { formatDistanceToNow } from 'date-fns'

interface B2BASINList {
  id: string
  name: string
  description: string | null
  asins: string[]
  asin_count: number
  is_favorite: boolean
  last_scanned_at: string | null
  scan_count: number
  created_at: string
  updated_at: string
}

interface B2BASINListManagerProps {
  onLoadList: (asins: string[], listName: string, listId: string) => void
  onScanList: (asins: string[], listName: string, listId: string) => void
  currentListId?: string | null
}

export default function B2BASINListManager({ 
  onLoadList, 
  onScanList,
  currentListId 
}: B2BASINListManagerProps) {
  const [lists, setLists] = useState<B2BASINList[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanningListId, setScanningListId] = useState<string | null>(null)

  useEffect(() => {
    fetchLists()
  }, [])

  const fetchLists = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const response = await fetch('/api/b2b-asin-lists', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch B2B lists')
      }

      const { lists } = await response.json()
      setLists(lists || [])
    } catch (err) {
      console.error('Error fetching B2B ASIN lists:', err)
      setError('Failed to load B2B ASIN lists')
    } finally {
      setLoading(false)
    }
  }

  const toggleFavorite = async (list: B2BASINList) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/b2b-asin-lists/${list.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ is_favorite: !list.is_favorite })
      })

      if (!response.ok) {
        throw new Error('Failed to update favorite status')
      }

      // Update local state
      setLists(lists.map(l => 
        l.id === list.id ? { ...l, is_favorite: !l.is_favorite } : l
      ))
    } catch (err) {
      console.error('Error toggling favorite:', err)
    }
  }

  const deleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this B2B list?')) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/b2b-asin-lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete list')
      }

      // Update local state
      setLists(lists.filter(l => l.id !== listId))
    } catch (err) {
      console.error('Error deleting list:', err)
      alert('Failed to delete list')
    }
  }

  const duplicateList = async (list: B2BASINList) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/b2b-asin-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: `${list.name} (Copy)`,
          description: list.description,
          asins: list.asins,
          is_favorite: false
        })
      })

      if (!response.ok) {
        throw new Error('Failed to duplicate list')
      }

      // Refresh lists
      await fetchLists()
    } catch (err) {
      console.error('Error duplicating list:', err)
      alert('Failed to duplicate list')
    }
  }

  const handleScanList = async (list: B2BASINList) => {
    try {
      // Set scanning state
      setScanningListId(list.id)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setScanningListId(null)
        return
      }

      // Update scan statistics
      await fetch(`/api/b2b-asin-lists/${list.id}/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      // Trigger scan - this will start the analysis immediately
      onScanList(list.asins, list.name, list.id)
      
      // Update local state
      setLists(lists.map(l => 
        l.id === list.id 
          ? { 
              ...l, 
              last_scanned_at: new Date().toISOString(),
              scan_count: l.scan_count + 1
            } 
          : l
      ))
      
      // Clear scanning state after a short delay to show feedback
      setTimeout(() => setScanningListId(null), 1000)
    } catch (err) {
      console.error('Error scanning list:', err)
      setScanningListId(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-100 rounded"></div>
            <div className="h-20 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-4 mb-6">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="text-center py-8">
          <BuildingOfficeIcon className="h-12 w-12 text-purple-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No B2B ASIN Lists Yet</h3>
          <p className="text-gray-500 text-sm">Save your B2B arbitrage ASINs as a list to reuse them later</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BuildingOfficeIcon className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">My B2B ASIN Lists</h2>
        </div>
        <button
          onClick={fetchLists}
          className="text-sm text-purple-600 hover:text-purple-800"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {lists.map((list) => (
          <div
            key={list.id}
            className={`border rounded-lg p-4 transition-all ${
              currentListId === list.id 
                ? 'border-purple-300 bg-purple-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900">{list.name}</h3>
                  <button
                    onClick={() => toggleFavorite(list)}
                    className="text-yellow-500 hover:text-yellow-600"
                  >
                    {list.is_favorite ? (
                      <StarIconSolid className="h-5 w-5" />
                    ) : (
                      <StarIcon className="h-5 w-5" />
                    )}
                  </button>
                  {currentListId === list.id && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      Current
                    </span>
                  )}
                </div>
                
                {list.description && (
                  <p className="text-sm text-gray-600 mb-2">{list.description}</p>
                )}
                
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{list.asin_count} ASINs</span>
                  {list.scan_count > 0 && (
                    <span>Scanned {list.scan_count} times</span>
                  )}
                  {list.last_scanned_at && (
                    <span>
                      Last scan {formatDistanceToNow(new Date(list.last_scanned_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <button
                  onClick={() => onLoadList(list.asins, list.name, list.id)}
                  className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Load ASINs"
                >
                  <DocumentDuplicateIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => handleScanList(list)}
                  disabled={scanningListId === list.id}
                  className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Scan Now"
                >
                  {scanningListId === list.id ? (
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <PlayIcon className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={() => duplicateList(list)}
                  className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  title="Duplicate List"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => deleteList(list.id)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete List"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}