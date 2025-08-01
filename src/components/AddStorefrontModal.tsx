'use client'

import { Fragment, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'

interface AddStorefrontModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddStorefrontModal({ isOpen, onClose, onSuccess }: AddStorefrontModalProps) {
  const [sellerId, setSellerId] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDuplicateId, setIsDuplicateId] = useState(false)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)

  // Check for duplicate seller ID as user types
  useEffect(() => {
    const checkDuplicate = async () => {
      if (!sellerId || sellerId.length < 3) {
        setIsDuplicateId(false)
        return
      }

      setCheckingDuplicate(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: existing } = await supabase
          .from('storefronts')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('seller_id', sellerId)
          .single()

        setIsDuplicateId(!!existing)
        if (existing) {
          setError(`This seller ID is already added as "${existing.name}"`)
        } else {
          setError(null)
        }
      } catch (error) {
        // No duplicate found
        setIsDuplicateId(false)
        if (error) setError(null)
      } finally {
        setCheckingDuplicate(false)
      }
    }

    const timeoutId = setTimeout(checkDuplicate, 500) // Debounce
    return () => clearTimeout(timeoutId)
  }, [sellerId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent submission if duplicate exists
    if (isDuplicateId) {
      setError('Cannot add duplicate seller ID')
      return
    }
    
    setLoading(true)
    setError(null)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      // Check if seller ID already exists for this user
      const { data: existingStorefront, error: checkError } = await supabase
        .from('storefronts')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .single()

      if (existingStorefront) {
        throw new Error(`This seller ID is already added as "${existingStorefront.name}". Each seller can only be added once.`)
      }

      // Generate storefront URL
      const storefrontUrl = `https://www.amazon.co.uk/s?me=${sellerId}`

      // Insert storefront
      const { data: newStorefront, error } = await supabase
        .from('storefronts')
        .insert({
          user_id: user.id,
          seller_id: sellerId,
          name: name,
          storefront_url: storefrontUrl
        })
        .select()
        .single()

      if (error) throw error

      // Reset form and close modal immediately
      setSellerId('')
      setName('')
      onSuccess()
      onClose()

      // Synchronise products in the background (fire and forget)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        fetch('/api/sync-storefront-keepa', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            storefrontId: newStorefront.id,
            sellerId: sellerId
          })
        }).then(response => {
          if (!response.ok) {
            console.error('Background synchronisation failed')
          } else {
            console.log('Background synchronisation started successfully')
          }
        }).catch(error => {
          console.error('Background synchronisation error:', error)
        })
      }
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                <div className="bg-white px-6 pt-6">
                  <div className="flex items-center justify-between mb-6">
                    <Dialog.Title as="h3" className="text-xl font-semibold text-gray-900">
                      Add New Storefront
                    </Dialog.Title>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-500"
                      onClick={onClose}
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="sellerId" className="block text-sm font-medium text-gray-700 mb-1">
                        Seller ID
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="sellerId"
                          value={sellerId}
                          onChange={(e) => setSellerId(e.target.value)}
                          required
                          placeholder="e.g., A170174SA50S7P"
                          className={`w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                            isDuplicateId ? 'border-red-300' : 'border-gray-300'
                          }`}
                        />
                        {checkingDuplicate && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        The unique Amazon seller ID from the storefront URL
                      </p>
                    </div>

                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Storefront Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="e.g., Jake (thehustleclub)"
                        className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        A friendly name to identify this storefront
                      </p>
                    </div>

                    {error && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
                        {error}
                      </div>
                    )}

                    <div className="flex gap-3 pt-4 pb-6">
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading || isDuplicateId || checkingDuplicate}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium hover:from-violet-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? 'Adding...' : isDuplicateId ? 'Duplicate Seller ID' : 'Add Storefront'}
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}