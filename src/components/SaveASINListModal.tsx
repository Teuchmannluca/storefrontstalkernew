'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface SaveASINListModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  asins: string[]
  existingListId?: string | null
  existingListName?: string | null
}

export default function SaveASINListModal({
  isOpen,
  onClose,
  onSave,
  asins,
  existingListId,
  existingListName
}: SaveASINListModalProps) {
  const [name, setName] = useState(existingListName || '')
  const [description, setDescription] = useState('')
  const [isFavorite, setIsFavorite] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        return
      }

      const endpoint = existingListId 
        ? `/api/asin-lists/${existingListId}`
        : '/api/asin-lists'
      
      const method = existingListId ? 'PUT' : 'POST'
      
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          asins,
          is_favorite: isFavorite
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save list')
      }

      // Success
      onSave()
      onClose()
      
      // Reset form
      setName('')
      setDescription('')
      setIsFavorite(false)
    } catch (err) {
      console.error('Error saving list:', err)
      setError(err instanceof Error ? err.message : 'Failed to save list')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {existingListId ? 'Update ASIN List' : 'Save ASIN List'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              List Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., Electronics Top Sellers"
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Optional description for this list"
              rows={3}
            />
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Mark as favorite</span>
            </label>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              This list contains <span className="font-medium">{asins.length} ASINs</span>
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || !name.trim()}
            >
              {saving ? 'Saving...' : (existingListId ? 'Update List' : 'Save List')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}