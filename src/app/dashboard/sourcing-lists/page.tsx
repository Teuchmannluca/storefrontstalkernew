'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import AddStorefrontModal from '@/components/AddStorefrontModal'
import { 
  PlusIcon,
  TrashIcon,
  StarIcon,
  EyeIcon,
  PencilIcon,
  CalendarIcon,
  CurrencyPoundIcon,
  ShoppingBagIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'

interface SourcingList {
  id: string
  name: string
  description?: string
  is_favorite: boolean
  item_count: number
  total_profit: number
  created_at: string
  updated_at: string
}

interface SourcingListItem {
  id: string
  asin: string
  product_name: string
  product_image?: string
  uk_price: number
  source_marketplace: string
  source_price_gbp: number
  profit: number
  roi: number
  profit_margin: number
  sales_per_month?: number
  storefront_name?: string
  added_from: string
  notes?: string
  created_at: string
}

export default function SourcingListsPage() {
  const [sourcingLists, setSourcingLists] = useState<SourcingList[]>([])
  const [selectedList, setSelectedList] = useState<SourcingList | null>(null)
  const [listItems, setListItems] = useState<SourcingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [showAddStorefrontModal, setShowAddStorefrontModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showDeleteItemConfirm, setShowDeleteItemConfirm] = useState<string | null>(null)
  const [editingList, setEditingList] = useState<SourcingList | null>(null)
  
  // Form states
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const router = useRouter()

  useEffect(() => {
    checkAuth()
    fetchSourcingLists()
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error || !user) {
        console.log('User not authenticated, redirecting to login')
        router.push('/')
        return
      }
    } catch (error) {
      console.error('Failed to check user:', error)
      router.push('/')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const fetchSourcingLists = async () => {
    try {
      setLoading(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/sourcing-lists', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (response.ok) {
        setSourcingLists(result.lists || [])
      } else {
        console.error('Failed to fetch sourcing lists:', result.error)
      }
    } catch (error) {
      console.error('Error fetching sourcing lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchListItems = async (listId: string) => {
    try {
      setLoadingItems(true)
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/sourcing-lists/${listId}/items`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (response.ok) {
        setListItems(result.items || [])
      } else {
        console.error('Failed to fetch list items:', result.error)
      }
    } catch (error) {
      console.error('Error fetching list items:', error)
    } finally {
      setLoadingItems(false)
    }
  }

  const handleCreateList = async () => {
    if (!newListName.trim()) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/sourcing-lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newListName.trim(),
          description: newListDescription.trim() || null
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSourcingLists(prev => [result.list, ...prev])
        setShowCreateModal(false)
        setNewListName('')
        setNewListDescription('')
      } else {
        console.error('Failed to create list:', result.error)
      }
    } catch (error) {
      console.error('Error creating list:', error)
    }
  }

  const handleDeleteList = async (listId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/sourcing-lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setSourcingLists(prev => prev.filter((list: any) => list.id !== listId))
        if (selectedList?.id === listId) {
          setSelectedList(null)
          setListItems([])
        }
        setShowDeleteConfirm(null)
      } else {
        const result = await response.json()
        console.error('Failed to delete list:', result.error)
      }
    } catch (error) {
      console.error('Error deleting list:', error)
    }
  }

  const handleToggleFavorite = async (listId: string, currentFavorite: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/sourcing-lists/${listId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          is_favorite: !currentFavorite
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSourcingLists(prev => prev.map((list: any) => 
          list.id === listId 
            ? { ...list, is_favorite: !currentFavorite }
            : list
        ))
        if (selectedList?.id === listId) {
          setSelectedList(prev => prev ? { ...prev, is_favorite: !currentFavorite } : null)
        }
      } else {
        console.error('Failed to toggle favorite:', result.error)
      }
    } catch (error) {
      console.error('Error toggling favorite:', error)
    }
  }

  const handleEditList = async () => {
    if (!editingList || !editName.trim()) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/sourcing-lists/${editingList.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSourcingLists(prev => prev.map((list: any) => 
          list.id === editingList.id 
            ? { ...list, name: editName.trim(), description: editDescription.trim() || undefined }
            : list
        ))
        if (selectedList?.id === editingList.id) {
          setSelectedList(prev => prev ? { 
            ...prev, 
            name: editName.trim(), 
            description: editDescription.trim() || undefined 
          } : null)
        }
        setEditingList(null)
        setEditName('')
        setEditDescription('')
      } else {
        console.error('Failed to edit list:', result.error)
      }
    } catch (error) {
      console.error('Error editing list:', error)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedList) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(`/api/sourcing-lists/${selectedList.id}/items`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_id: itemId
        })
      })

      if (response.ok) {
        // Remove item from local state
        setListItems(prev => prev.filter((item: any) => item.id !== itemId))
        
        // Update the selected list totals
        const deletedItem = listItems.find((item: any) => item.id === itemId)
        if (deletedItem && selectedList) {
          const newItemCount = selectedList.item_count - 1
          const newTotalProfit = selectedList.total_profit - deletedItem.profit
          
          setSelectedList(prev => prev ? {
            ...prev,
            item_count: newItemCount,
            total_profit: newTotalProfit
          } : null)
          
          // Also update in the lists array
          setSourcingLists(prev => prev.map((list: any) => 
            list.id === selectedList.id
              ? { ...list, item_count: newItemCount, total_profit: newTotalProfit }
              : list
          ))
        }
        
        setShowDeleteItemConfirm(null)
      } else {
        const result = await response.json()
        console.error('Failed to delete item:', result.error)
      }
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getAmazonDomain = (marketplace: string) => {
    switch (marketplace) {
      case 'DE': return 'de'
      case 'FR': return 'fr'
      case 'IT': return 'it'
      case 'ES': return 'es'
      case 'NL': return 'nl'
      default: return 'de'
    }
  }

  const getCountryFlag = (marketplace: string) => {
    const flags: { [key: string]: string } = {
      'DE': '🇩🇪',
      'FR': '🇫🇷', 
      'IT': '🇮🇹',
      'ES': '🇪🇸',
      'NL': '🇳🇱'
    }
    return flags[marketplace] || marketplace
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        onSignOut={handleSignOut} 
        onAddStorefront={() => setShowAddStorefrontModal(true)}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {!selectedList ? (
            // Lists Overview
            <>
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <ShoppingBagIcon className="w-8 h-8 text-indigo-600" />
                    <h1 className="text-3xl font-bold text-gray-900">Sourcing Lists</h1>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Create List
                  </button>
                </div>
                <p className="text-gray-600">Organize and manage your saved arbitrage opportunities</p>
              </div>

              {sourcingLists.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                  <ShoppingBagIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No sourcing lists yet</h3>
                  <p className="text-gray-500 mb-6">
                    Create your first sourcing list to start organizing profitable deals
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors mx-auto"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Create Your First List
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sourcingLists.map((list: any) => (
                    <div
                      key={list.id}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-start gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 text-lg line-clamp-2 flex-1">
                              {list.name}
                            </h3>
                            <button
                              onClick={() => handleToggleFavorite(list.id, list.is_favorite)}
                              className="text-gray-400 hover:text-yellow-500 transition-colors"
                            >
                              {list.is_favorite ? (
                                <StarIconSolid className="w-5 h-5 text-yellow-500" />
                              ) : (
                                <StarIcon className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                          {list.description && (
                            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                              {list.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Items</span>
                          <span className="font-medium text-gray-900">{list.item_count}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Total Profit</span>
                          <span className="font-medium text-green-600">£{list.total_profit.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Created</span>
                          <span className="text-sm text-gray-600">{formatDateTime(list.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedList(list)
                            fetchListItems(list.id)
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                        >
                          <EyeIcon className="w-4 h-4" />
                          View Items
                        </button>
                        <button
                          onClick={() => {
                            setEditingList(list)
                            setEditName(list.name)
                            setEditDescription(list.description || '')
                          }}
                          className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(list.id)}
                          className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // List Items View
            <>
              <div className="mb-6">
                <button
                  onClick={() => {
                    setSelectedList(null)
                    setListItems([])
                  }}
                  className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-4"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Sourcing Lists
                </button>

                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-3xl font-bold text-gray-900">{selectedList.name}</h1>
                      {selectedList.is_favorite && (
                        <StarIconSolid className="w-6 h-6 text-yellow-500" />
                      )}
                    </div>
                    {selectedList.description && (
                      <p className="text-gray-600 mb-4">{selectedList.description}</p>
                    )}
                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      <span>{selectedList.item_count} items</span>
                      <span>Total profit: £{selectedList.total_profit.toFixed(2)}</span>
                      <span>Created: {formatDateTime(selectedList.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {loadingItems ? (
                <div className="flex items-center justify-center h-64">
                  <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : listItems.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                  <ExclamationTriangleIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No items in this list</h3>
                  <p className="text-gray-500">Add profitable deals from Recent Scans or A2A EU analysis</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {listItems.map((item: any) => (
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                      <div className="flex items-start gap-6">
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          {item.product_image ? (
                            <img src={item.product_image} alt={item.product_name} className="w-full h-full object-contain rounded-lg" />
                          ) : (
                            <span className="text-gray-400 text-xs">No image</span>
                          )}
                        </div>

                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 text-lg mb-2 line-clamp-2">{item.product_name}</h3>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                            <span>{item.asin}</span>
                            {item.storefront_name && (
                              <span className="text-indigo-600">@ {item.storefront_name}</span>
                            )}
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                              {item.added_from === 'recent_scans' ? 'Recent Scans' : 'A2A EU'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">UK Price:</span>
                              <span className="font-medium text-blue-600 ml-2">£{item.uk_price.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Source:</span>
                              <span className="font-medium ml-2">
                                {getCountryFlag(item.source_marketplace)} £{item.source_price_gbp.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Profit:</span>
                              <span className={`font-medium ml-2 ${item.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                £{item.profit.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">ROI:</span>
                              <span className={`font-medium ml-2 ${item.roi > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {item.roi.toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 mt-4">
                            <a
                              href={`https://www.amazon.co.uk/dp/${item.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                              </svg>
                              UK Amazon
                            </a>
                            <a
                              href={`https://www.amazon.${getAmazonDomain(item.source_marketplace)}/dp/${item.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:underline text-sm flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                              </svg>
                              {getCountryFlag(item.source_marketplace)} Source
                            </a>
                            <span className="text-xs text-gray-500">
                              Added: {formatDateTime(item.created_at)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Delete button */}
                        <div className="flex-shrink-0">
                          <button
                            onClick={() => setShowDeleteItemConfirm(item.id)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from list"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create List Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Sourcing List</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Enter list name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  maxLength={255}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  placeholder="Enter description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewListName('')
                  setNewListDescription('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Create List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Sourcing List</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter list name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  maxLength={255}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Enter description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setEditingList(null)
                  setEditName('')
                  setEditDescription('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditList}
                disabled={!editName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {showDeleteItemConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Remove Item</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-6">
              Are you sure you want to remove this item from the sourcing list?
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteItemConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteItem(showDeleteItemConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Remove Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete List Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Delete Sourcing List</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this sourcing list? All items in the list will be permanently removed.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteList(showDeleteConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete List
              </button>
            </div>
          </div>
        </div>
      )}

      <AddStorefrontModal
        isOpen={showAddStorefrontModal}
        onClose={() => setShowAddStorefrontModal(false)}
        onSuccess={() => {
          setShowAddStorefrontModal(false)
        }}
      />
    </div>
  )
}