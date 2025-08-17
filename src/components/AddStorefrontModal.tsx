'use client'

import { useState, useEffect } from 'react'
import { BuildingStorefrontIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { PremiumModal, ModalBody, ModalFooter } from '@/components/ui/premium-modal'
import { PremiumInput } from '@/components/ui/premium-input'
import { PremiumButton } from '@/components/ui/premium-button'

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
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Storefront"
      description="Connect your Amazon storefront to start finding profitable deals"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody>
          <div className="space-y-6">
            {/* Seller ID Input */}
            <PremiumInput
              label="Seller ID"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              required
              placeholder="e.g., A170174SA50S7P"
              helperText="The unique Amazon seller ID from the storefront URL"
              error={isDuplicateId ? error || undefined : undefined}
              success={!isDuplicateId && sellerId.length > 3 && !checkingDuplicate ? "Valid seller ID" : undefined}
              loading={checkingDuplicate}
            />

            {/* Storefront Name Input */}
            <PremiumInput
              label="Storefront Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Jake (thehustleclub)"
              helperText="A friendly name to identify this storefront"
            />

            {/* Additional Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <BuildingStorefrontIcon className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-blue-900 mb-1">What happens next?</h4>
                  <p className="text-sm text-blue-700">
                    We&apos;ll automatically sync this storefront&apos;s products in the background. 
                    You can start analyzing deals once the sync is complete.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>

        <ModalFooter align="between">
          <PremiumButton
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={loading}
          >
            Cancel
          </PremiumButton>
          
          <PremiumButton
            type="submit"
            disabled={loading || isDuplicateId || checkingDuplicate || !sellerId || !name}
            loading={loading}
            loadingText="Adding..."
            gradient
            icon={<BuildingStorefrontIcon className="w-5 h-5" />}
          >
            {isDuplicateId ? 'Duplicate Seller ID' : 'Add Storefront'}
          </PremiumButton>
        </ModalFooter>
      </form>
    </PremiumModal>
  )
}