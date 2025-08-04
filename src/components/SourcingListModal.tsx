'use client'

import { useState, useEffect, Fragment } from 'react'
import { Dialog, Transition, Listbox } from '@headlessui/react'
import { 
  CheckIcon, 
  ChevronDownIcon, 
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'

interface SourcingList {
  id: string
  name: string
  description?: string
  item_count: number
  total_profit: number
  is_favorite: boolean
}

interface Deal {
  asin: string
  productName: string
  productImage?: string
  targetPrice: number
  bestOpportunity: {
    marketplace: string
    sourcePrice: number
    sourcePriceGBP: number
    profit: number
    roi: number
  }
  storefronts?: Array<{
    id: string
    name: string
    seller_id: string
  }>
  salesPerMonth?: number
}

interface SourcingListModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDeals: Deal[]
  addedFrom: 'recent_scans' | 'a2a_eu'
}

export default function SourcingListModal({ isOpen, onClose, selectedDeals, addedFrom }: SourcingListModalProps) {
  const [sourcingLists, setSourcingLists] = useState<SourcingList[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchSourcingLists()
    }
  }, [isOpen])

  const fetchSourcingLists = async () => {
    try {
      setLoading(true)
      setError('')
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Authentication required')
        return
      }

      const response = await fetch('/api/sourcing-lists', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch sourcing lists')
      }

      setSourcingLists(result.lists || [])
      
      // Auto-select first list if available
      if (result.lists && result.lists.length > 0) {
        setSelectedListId(result.lists[0].id)
      }
    } catch (error) {
      console.error('Error fetching sourcing lists:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch lists')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setError('')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Authentication required')
        return
      }

      // Prepare the deals data for the API
      const dealsToAdd = selectedDeals.map(deal => ({
        asin: deal.asin,
        product_name: deal.productName,
        product_image: deal.productImage || null,
        uk_price: deal.targetPrice,
        source_marketplace: deal.bestOpportunity.marketplace,
        source_price_gbp: deal.bestOpportunity.sourcePriceGBP,
        profit: deal.bestOpportunity.profit,
        roi: deal.bestOpportunity.roi,
        profit_margin: (deal.bestOpportunity.profit / deal.targetPrice) * 100,
        sales_per_month: deal.salesPerMonth || null,
        storefront_name: deal.storefronts?.[0]?.name || null,
        added_from: addedFrom
      }))

      const requestBody: any = {
        items: dealsToAdd
      }

      // If creating new list, add the creation data
      if (isCreatingNew) {
        if (!newListName.trim()) {
          setError('List name is required')
          return
        }
        requestBody.create_new_list = {
          name: newListName.trim(),
          description: newListDescription.trim() || null
        }
      } else {
        if (!selectedListId) {
          setError('Please select a list')
          return
        }
        requestBody.list_id = selectedListId
      }

      const response = await fetch('/api/sourcing-lists/add-items', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add items to sourcing list')
      }

      // Success! Close modal and reset state
      onClose()
      resetModal()
      
      // You could add a success toast here if needed
      console.log(`Successfully added ${result.added_count} items to sourcing list`)
      
    } catch (error) {
      console.error('Error adding items to sourcing list:', error)
      setError(error instanceof Error ? error.message : 'Failed to add items')
    } finally {
      setSubmitting(false)
    }
  }

  const resetModal = () => {
    setSelectedListId('')
    setIsCreatingNew(false)
    setNewListName('')
    setNewListDescription('')
    setError('')
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
      resetModal()
    }
  }

  const totalProfit = selectedDeals.reduce((sum, deal) => sum + deal.bestOpportunity.profit, 0)

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Add to Sourcing List
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    disabled={submitting}
                    className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Selected deals summary */}
                <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-indigo-900">
                        {selectedDeals.length} deal{selectedDeals.length === 1 ? '' : 's'} selected
                      </p>
                      <p className="text-sm text-indigo-700">
                        Total profit: £{totalProfit.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-2xl">📋</div>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="ml-2 text-gray-600">Loading lists...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Toggle between existing and new list */}
                    <div className="flex rounded-lg bg-gray-100 p-1">
                      <button
                        onClick={() => setIsCreatingNew(false)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          !isCreatingNew
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500'
                        }`}
                      >
                        Existing List
                      </button>
                      <button
                        onClick={() => setIsCreatingNew(true)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                          isCreatingNew
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500'
                        }`}
                      >
                        Create New
                      </button>
                    </div>

                    {isCreatingNew ? (
                      // Create new list form
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            List Name *
                          </label>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description (optional)
                          </label>
                          <textarea
                            value={newListDescription}
                            onChange={(e) => setNewListDescription(e.target.value)}
                            placeholder="Enter description..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    ) : (
                      // Select existing list
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select List
                        </label>
                        {sourcingLists.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <div className="text-4xl mb-2">📝</div>
                            <p className="text-sm">No sourcing lists found</p>
                            <p className="text-xs">Create your first list above!</p>
                          </div>
                        ) : (
                          <Listbox value={selectedListId} onChange={setSelectedListId}>
                            <div className="relative">
                              <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-300">
                                {selectedListId ? (
                                  <span className="block truncate">
                                    {sourcingLists.find(list => list.id === selectedListId)?.name || 'Select a list...'}
                                  </span>
                                ) : (
                                  <span className="block truncate text-gray-500">Select a list...</span>
                                )}
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                  <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                </span>
                              </Listbox.Button>
                              <Transition
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                                  {sourcingLists.map((list) => (
                                    <Listbox.Option
                                      key={list.id}
                                      value={list.id}
                                      className={({ active }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                          active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'
                                        }`
                                      }
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div>
                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                              {list.name}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              {list.item_count} items • £{list.total_profit.toFixed(2)} profit
                                            </span>
                                          </div>
                                          {selected && (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600">
                                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </Listbox.Option>
                                  ))}
                                </Listbox.Options>
                              </Transition>
                            </div>
                          </Listbox>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || loading || (isCreatingNew && !newListName.trim()) || (!isCreatingNew && !selectedListId)}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting && (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    )}
                    {isCreatingNew ? 'Create & Add' : 'Add to List'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}