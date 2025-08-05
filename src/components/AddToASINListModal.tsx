'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  XMarkIcon,
  PlusIcon,
  FolderIcon,
  CheckIcon
} from '@heroicons/react/24/outline'

interface ASINList {
  id: string
  name: string
  description: string | null
  asin_count: number
  is_favorite: boolean
}

interface AddToASINListModalProps {
  isOpen: boolean
  onClose: () => void
  asins: string[]
  productNames?: { [asin: string]: string }
}

export default function AddToASINListModal({
  isOpen,
  onClose,
  asins,
  productNames = {}
}: AddToASINListModalProps) {
  const [lists, setLists] = useState<ASINList[]>([])
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // New list creation state
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [newListFavorite, setNewListFavorite] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchLists()
      setSelectedLists(new Set())
      setError(null)
      setSuccess(null)
      setShowCreateNew(false)
      setNewListName('')
      setNewListDescription('')
      setNewListFavorite(false)
    }
  }, [isOpen])

  const fetchLists = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const response = await fetch('/api/asin-lists', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch lists')
      }

      const { lists } = await response.json()
      setLists(lists || [])
    } catch (err) {
      console.error('Error fetching ASIN lists:', err)
      setError('Failed to load ASIN lists')
    } finally {
      setLoading(false)
    }
  }

  const handleListToggle = (listId: string) => {
    const newSelected = new Set(selectedLists)
    if (newSelected.has(listId)) {
      newSelected.delete(listId)
    } else {
      newSelected.add(listId)
    }
    setSelectedLists(newSelected)
  }

  const createNewList = async () => {
    if (!newListName.trim()) return null

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/asin-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim(),
          asins: [],
          is_favorite: newListFavorite
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create list')
      }

      const { list } = await response.json()
      return list.id
    } catch (err) {
      console.error('Error creating list:', err)
      throw err
    }
  }

  const handleSubmit = async () => {
    if (selectedLists.size === 0 && !showCreateNew) {
      setError('Please select at least one list or create a new one')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      let listsToUpdate = Array.from(selectedLists)

      // Create new list if needed
      if (showCreateNew && newListName.trim()) {
        const newListId = await createNewList()
        if (newListId) {
          listsToUpdate.push(newListId)
        }
      }

      if (listsToUpdate.length === 0) {
        setError('No lists selected')
        return
      }

      // Add ASINs to selected lists
      const response = await fetch('/api/asin-lists/add-asins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          listIds: listsToUpdate,
          asins: asins
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add ASINs to lists')
      }

      const { results } = await response.json()
      
      // Show success message
      const totalAdded = results.reduce((sum: number, result: any) => sum + result.addedCount, 0)
      setSuccess(`Successfully added ${totalAdded} ASINs to ${listsToUpdate.length} list(s)`)
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose()
      }, 2000)

    } catch (err) {
      console.error('Error adding ASINs to lists:', err)
      setError(err instanceof Error ? err.message : 'Failed to add ASINs to lists')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Add to ASIN Lists
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Adding <span className="font-medium">{asins.length} ASIN{asins.length !== 1 ? 's' : ''}</span> to selected lists
          </p>
          {asins.length <= 5 && (
            <div className="mt-2 space-y-1">
              {asins.map(asin => (
                <p key={asin} className="text-xs text-gray-500">
                  {asin}{productNames[asin] ? ` - ${productNames[asin]}` : ''}
                </p>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading lists...</p>
          </div>
        ) : (
          <>
            {/* Existing Lists */}
            {lists.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Select Existing Lists</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {lists.map((list) => (
                    <label
                      key={list.id}
                      className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLists.has(list.id)}
                        onChange={() => handleListToggle(list.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FolderIcon className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{list.name}</span>
                          {list.is_favorite && (
                            <span className="text-yellow-500">⭐</span>
                          )}
                        </div>
                        {list.description && (
                          <p className="text-sm text-gray-600 mt-1">{list.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {list.asin_count} ASINs
                        </p>
                      </div>
                      {selectedLists.has(list.id) && (
                        <CheckIcon className="h-5 w-5 text-indigo-600" />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Create New List Section */}
            <div className="border-t pt-4">
              <button
                onClick={() => setShowCreateNew(!showCreateNew)}
                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <PlusIcon className="h-5 w-5" />
                Create New List
              </button>

              {showCreateNew && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        List Name *
                      </label>
                      <input
                        type="text"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., High Profit ASINs"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={newListDescription}
                        onChange={(e) => setNewListDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Optional description"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newListFavorite}
                        onChange={(e) => setNewListFavorite(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Mark as favorite</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving || (selectedLists.size === 0 && (!showCreateNew || !newListName.trim()))}
              >
                {saving ? 'Adding...' : 'Add to Lists'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}