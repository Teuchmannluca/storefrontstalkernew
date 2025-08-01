import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface SyncResult {
  success: boolean
  message: string
  count?: number
  error?: string
}

export function useProductSync() {
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncResult>>({})

  const syncStorefrontProducts = async (
    storefrontId: string, 
    sellerId: string, 
    storefrontName: string,
    useKeepaAPI: boolean = true
  ): Promise<SyncResult> => {
    setSyncing(true)
    setSyncStatus(prev => ({
      ...prev,
      [storefrontId]: { success: false, message: 'Synchronising...' }
    }))

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }

      // Use Keepa API endpoint for fetching ASINs
      const endpoint = useKeepaAPI ? '/api/sync-storefront-keepa' : '/api/scrape-storefront-enhanced';
      console.log('useProductSync - Using endpoint:', endpoint, 'useKeepaAPI:', useKeepaAPI);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storefrontId,
          sellerId,
          storefrontName
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if it's a rate limit error
        if (response.status === 429 && data.waitTimeSeconds) {
          throw new Error(`Rate limit reached. Please wait ${data.waitTimeSeconds} seconds before trying again.`)
        }
        throw new Error(data.error || 'Failed to synchronise products')
      }

      const result: SyncResult = {
        success: true,
        message: `Successfully fetched ${data.totalAsins} ASINs. Added ${data.productsAdded} new products.`,
        count: data.productsAdded
      }

      setSyncStatus(prev => ({
        ...prev,
        [storefrontId]: result
      }))

      return result

    } catch (error: any) {
      const result: SyncResult = {
        success: false,
        message: 'Synchronisation failed',
        error: error.message
      }

      setSyncStatus(prev => ({
        ...prev,
        [storefrontId]: result
      }))

      return result

    } finally {
      setSyncing(false)
    }
  }

  const syncAllStorefronts = async (storefronts: Array<{ id: string, seller_id: string, name: string }>) => {
    const results = []
    
    for (const storefront of storefronts) {
      const result = await syncStorefrontProducts(storefront.id, storefront.seller_id, storefront.name)
      results.push({ storefrontId: storefront.id, ...result })
      
      // Add delay between requests
      // Rate limiting temporarily disabled for testing
      if (storefronts.indexOf(storefront) < storefronts.length - 1) {
        // Short delay for testing (was 3 minutes for rate limiting)
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2 seconds
      }
    }
    
    return results
  }

  return {
    syncing,
    syncStatus,
    syncStorefrontProducts,
    syncAllStorefronts
  }
}