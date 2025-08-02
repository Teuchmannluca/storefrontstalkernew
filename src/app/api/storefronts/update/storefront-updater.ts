import { supabase } from '@/lib/supabase'
// import { getASINsFromStorefront } from '@/lib/keepa-api'
// import { searchCatalogItems, getItemDetails } from '@/lib/amazon-sp-api'

interface Product {
  id: string
  asin: string
  storefront_id: string
}

export async function updateStorefront(storefrontId: string) {
  // Function temporarily disabled - missing dependencies
  return { 
    storefrontId, 
    added: 0, 
    removed: 0, 
    updated: 0, 
    error: 'Function temporarily disabled - missing getASINsFromStorefront and getItemDetails implementations' 
  }
  /* Commented out until dependencies are fixed
  try {
    // Get storefront details
    const { data: storefront, error: storefrontError } = await supabase
      .from('storefronts')
      .select('*')
      .eq('id', storefrontId)
      .single()

    if (storefrontError || !storefront) {
      throw new Error('Storefront not found')
    }

    console.log(`Updating storefront: ${storefront.name} (${storefront.seller_id})`)

    // Get current products for this storefront
    const { data: currentProducts, error: productsError } = await supabase
      .from('products')
      .select('id, asin')
      .eq('storefront_id', storefrontId)

    if (productsError) {
      throw productsError
    }

    const currentASINs = new Set(currentProducts?.map(p => p.asin) || [])

    // Fetch new ASINs from Keepa
    console.log(`Fetching ASINs from Keepa for seller ${storefront.seller_id}`)
    const newASINs = await getASINsFromStorefront(storefront.seller_id)
    const newASINsSet = new Set(newASINs)

    console.log(`Current ASINs: ${currentASINs.size}, New ASINs: ${newASINsSet.size}`)

    // Find ASINs to add and remove
    const asinsToAdd = newASINs.filter(asin => !currentASINs.has(asin))
    const asinsToRemove = Array.from(currentASINs).filter(asin => !newASINsSet.has(asin))

    console.log(`ASINs to add: ${asinsToAdd.length}, ASINs to remove: ${asinsToRemove.length}`)

    // Remove products that are no longer in the storefront
    if (asinsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('storefront_id', storefrontId)
        .in('asin', asinsToRemove)

      if (deleteError) {
        console.error('Error removing products:', deleteError)
      } else {
        console.log(`Removed ${asinsToRemove.length} products`)
      }
    }

    // Add new products in smaller batches to avoid database timeouts
    if (asinsToAdd.length > 0) {
      const batchSize = 100 // Insert 100 products at a time
      let totalInserted = 0

      for (let i = 0; i < asinsToAdd.length; i += batchSize) {
        const batch = asinsToAdd.slice(i, i + batchSize)
        const newProducts = batch.map(asin => ({
          asin,
          storefront_id: storefrontId,
          name: `Product ${asin}`,
          sync_status: 'pending'
        }))

        const { data, error: insertError } = await supabase
          .from('products')
          .insert(newProducts)
          .select()

        if (insertError) {
          console.error(`Error adding batch ${Math.floor(i / batchSize) + 1}:`, insertError)
        } else {
          totalInserted += data?.length || 0
          console.log(`Added batch ${Math.floor(i / batchSize) + 1}: ${data?.length || 0} products`)
        }
      }

      console.log(`Total added: ${totalInserted} new products`)
    }

    // Sync all products with Amazon SP-API
    console.log('Starting Amazon SP-API sync for all products')
    await syncProductsWithAmazon(storefrontId)

    // Update storefront last updated timestamp
    const { error: updateError } = await supabase
      .from('storefronts')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', storefrontId)

    if (updateError) {
      console.error('Error updating storefront timestamp:', updateError)
    }

    console.log(`Storefront ${storefront.name} update completed`)
    
    return {
      success: true,
      added: asinsToAdd.length,
      removed: asinsToRemove.length,
      total: newASINsSet.size
    }

  } catch (error) {
    console.error(`Error updating storefront ${storefrontId}:`, error)
    throw error
  }
}

async function syncProductsWithAmazon(storefrontId: string) {
  try {
    // Get all products for this storefront
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('storefront_id', storefrontId)

    if (error || !products) {
      throw new Error('Failed to fetch products')
    }

    console.log(`Syncing ${products.length} products with Amazon SP-API`)

    // Process products one by one to respect rate limits
    // Amazon SP-API allows 2 requests/sec with burst of 2
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 3
    let rateLimitWaitTime = 60000 // Initial wait time for rate limits (1 minute)
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      
      // Update sync status to 'syncing'
      await supabase
        .from('products')
        .update({ sync_status: 'syncing' })
        .eq('id', product.id)

      try {
        const details = await getItemDetails(product.asin)
        
        if (details) {
          await supabase
            .from('products')
            .update({
              name: details.title || product.name,
              image_url: details.imageUrl,
              brand: details.brand,
              sales_rank: details.salesRank,
              sync_status: 'success',
              last_synced_at: new Date().toISOString(),
              sync_error: null
            })
            .eq('id', product.id)
          
          consecutiveErrors = 0 // Reset error counter on success
          console.log(`✓ Synced product ${i + 1}/${products.length}: ${product.asin}`)
        } else {
          throw new Error('No details found')
        }
      } catch (error: any) {
        console.error(`Error syncing product ${product.asin}:`, error)
        consecutiveErrors++
        
        // Check for rate limit errors or quota exceeded
        const isRateLimitError = error.response?.status === 429 || 
                               error.message?.includes('429') || 
                               error.message?.includes('Too Many Requests') ||
                               error.message?.includes('QuotaExceeded') ||
                               error.message?.includes('You exceeded your quota')
        
        if (isRateLimitError) {
          console.log(`Rate limit/quota exceeded! Waiting ${rateLimitWaitTime / 1000} seconds...`)
          await new Promise(resolve => setTimeout(resolve, rateLimitWaitTime))
          
          // Exponential backoff: double the wait time for next rate limit
          rateLimitWaitTime = Math.min(rateLimitWaitTime * 2, 300000) // Max 5 minutes
          consecutiveErrors = 0
          i-- // Retry this product
          continue
        }
        
        // Too many consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log('Too many consecutive errors, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
          consecutiveErrors = 0
        }
        
        // Reset rate limit wait time on non-rate-limit errors
        if (!isRateLimitError && consecutiveErrors === 0) {
          rateLimitWaitTime = 60000 // Reset to 1 minute
        }
        
        await supabase
          .from('products')
          .update({
            sync_status: 'error',
            sync_error: error instanceof Error ? error.message : 'Unknown error',
            last_synced_at: new Date().toISOString()
          })
          .eq('id', product.id)
      }
      
      // Add delay between requests to respect rate limits
      // Amazon allows 2 req/sec, so 500ms delay = 2 req/sec
      // Extra delay for first few requests to avoid initial quota issues
      const delay = i < 5 ? 1500 : 500 // 1.5 seconds for first 5 requests, then 500ms
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      // Progress update every 10 products
      if ((i + 1) % 10 === 0) {
        console.log(`Progress: ${i + 1}/${products.length} products synced`)
      }
    }

    console.log(`Amazon SP-API sync completed for storefront ${storefrontId}`)

  } catch (error) {
    console.error('Error syncing products with Amazon:', error)
    throw error
  }
  */
}