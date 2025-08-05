import { getServiceRoleClient } from '@/lib/supabase-server'
import { KeepaStorefrontAPI } from './keepa-storefront'
import { KeepaPersistentRateLimiter } from './keepa-persistent-rate-limiter'
import { AmazonSPAPISimple } from './amazon-sp-api-simple'
import { SPAPIRateLimiter } from './sp-api-rate-limiter'


interface UpdateResult {
  storefrontId: string
  storefrontName: string
  productsAdded: number
  productsRemoved: number
  tokensUsed: number
  success: boolean
  error?: string
}

interface UpdateProgress {
  storefrontId: string
  storefrontName: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  message: string
  productsAdded?: number
  productsRemoved?: number
  tokensUsed?: number
}

export class KeepaUpdateManager {
  private userId: string
  private rateLimiter: KeepaPersistentRateLimiter
  private keepaApi: KeepaStorefrontAPI
  private spApi: AmazonSPAPISimple
  private spRateLimiter: SPAPIRateLimiter
  private progressCallback?: (progress: UpdateProgress) => void
  private supabase = getServiceRoleClient()

  constructor(userId: string, progressCallback?: (progress: UpdateProgress) => void) {
    this.userId = userId
    this.rateLimiter = new KeepaPersistentRateLimiter(userId)
    this.progressCallback = progressCallback

    // Check required environment variables
    const keepaApiKey = process.env.KEEPA_API_KEY
    if (!keepaApiKey) {
      throw new Error('Keepa API key not configured in environment variables')
    }

    const amazonAccessKey = process.env.AMAZON_ACCESS_KEY_ID
    const amazonSecretKey = process.env.AMAZON_SECRET_ACCESS_KEY
    const amazonRefreshToken = process.env.AMAZON_REFRESH_TOKEN
    const amazonMarketplaceId = process.env.AMAZON_MARKETPLACE_ID

    if (!amazonAccessKey || !amazonSecretKey || !amazonRefreshToken || !amazonMarketplaceId) {
      console.error('Missing Amazon SP-API credentials:', {
        hasAccessKey: !!amazonAccessKey,
        hasSecretKey: !!amazonSecretKey,
        hasRefreshToken: !!amazonRefreshToken,
        hasMarketplaceId: !!amazonMarketplaceId
      })
      throw new Error('Amazon SP-API credentials not configured. Please check your environment variables.')
    }
    
    const keepaDomain = parseInt(process.env.KEEPA_DOMAIN || '2')
    this.keepaApi = new KeepaStorefrontAPI(keepaApiKey, keepaDomain)

    // Initialize Amazon SP-API (simple version without STS role assumption)
    this.spApi = new AmazonSPAPISimple({
      clientId: amazonAccessKey,
      clientSecret: amazonSecretKey,
      refreshToken: amazonRefreshToken,
      region: 'eu',
      marketplaceId: amazonMarketplaceId
    })

    // Initialize SP-API rate limiter (2 requests/second for catalog items)
    this.spRateLimiter = new SPAPIRateLimiter({
      requestsPerSecond: 2,
      burstCapacity: 2
    })
  }

  /**
   * Add storefronts to update queue
   */
  async queueStorefrontUpdates(storefrontIds: string[]): Promise<void> {
    // Get storefront details
    const { data: storefronts, error } = await this.supabase
      .from('storefronts')
      .select('*')
      .in('id', storefrontIds)
      .eq('user_id', this.userId)

    if (error) {
      throw new Error(`Failed to fetch storefronts: ${error.message}`)
    }

    // Remove any existing queue items for these storefronts
    await this.supabase
      .from('storefront_update_queue')
      .delete()
      .in('storefront_id', storefrontIds)
      .eq('user_id', this.userId)

    // Add to queue with priority (older storefronts first)
    const queueItems = storefronts.map((storefront, index) => ({
      user_id: this.userId,
      storefront_id: storefront.id,
      priority: index, // Lower number = higher priority
      status: 'pending' as const
    }))

    const { error: insertError } = await this.supabase
      .from('storefront_update_queue')
      .insert(queueItems)

    if (insertError) {
      throw new Error(`Failed to queue updates: ${insertError.message}`)
    }
  }

  /**
   * Process all queued updates sequentially
   */
  async processQueue(): Promise<UpdateResult[]> {
    const results: UpdateResult[] = []

    while (true) {
      // Get next item in queue
      const { data: queueItem, error } = await this.supabase
        .from('storefront_update_queue')
        .select(`
          *,
          storefronts (
            id,
            name,
            seller_id
          )
        `)
        .eq('user_id', this.userId)
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .limit(1)
        .single()

      if (error || !queueItem) {
        // No more items in queue
        break
      }

      // Mark as processing
      await this.supabase
        .from('storefront_update_queue')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', queueItem.id)

      const storefront = queueItem.storefronts as any
      
      this.progressCallback?.({
        storefrontId: storefront.id,
        storefrontName: storefront.name,
        status: 'processing',
        progress: 0,
        message: `Starting update for ${storefront.name}...`
      })

      try {
        const result = await this.updateStorefront(queueItem.id, storefront)
        results.push(result)

        // Mark as completed
        await this.supabase
          .from('storefront_update_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            keepa_tokens_used: result.tokensUsed,
            products_added: result.productsAdded,
            products_removed: result.productsRemoved
          })
          .eq('id', queueItem.id)

        this.progressCallback?.({
          storefrontId: storefront.id,
          storefrontName: storefront.name,
          status: 'completed',
          progress: 100,
          message: `Completed: +${result.productsAdded} products, -${result.productsRemoved} products`,
          productsAdded: result.productsAdded,
          productsRemoved: result.productsRemoved,
          tokensUsed: result.tokensUsed
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Mark as error
        await this.supabase
          .from('storefront_update_queue')
          .update({
            status: 'error',
            completed_at: new Date().toISOString(),
            error_message: errorMessage
          })
          .eq('id', queueItem.id)

        const errorResult: UpdateResult = {
          storefrontId: storefront.id,
          storefrontName: storefront.name,
          productsAdded: 0,
          productsRemoved: 0,
          tokensUsed: 0,
          success: false,
          error: errorMessage
        }
        
        results.push(errorResult)

        this.progressCallback?.({
          storefrontId: storefront.id,
          storefrontName: storefront.name,
          status: 'error',
          progress: 0,
          message: `Error: ${errorMessage}`
        })
      }
    }

    return results
  }

  /**
   * Update a single storefront
   */
  private async updateStorefront(queueId: string, storefront: any): Promise<UpdateResult> {
    const storefrontId = storefront.id
    const sellerId = storefront.seller_id
    const storefrontName = storefront.name

    this.progressCallback?.({
      storefrontId,
      storefrontName,
      status: 'processing',
      progress: 10,
      message: 'Checking token availability...'
    })

    // Check if we have enough tokens (50 tokens for seller search)
    const tokensNeeded = 50
    const hasTokens = await this.rateLimiter.hasTokens(tokensNeeded)
    
    if (!hasTokens) {
      const waitTime = await this.rateLimiter.getWaitTimeForTokens(tokensNeeded)
      const waitMinutes = Math.ceil(waitTime / (1000 * 60))
      
      this.progressCallback?.({
        storefrontId,
        storefrontName,
        status: 'processing',
        progress: 10,
        message: `Waiting ${waitMinutes} minutes for Keepa tokens...`
      })
      
      await this.rateLimiter.consumeTokens(tokensNeeded)
    } else {
      await this.rateLimiter.consumeTokens(tokensNeeded)
    }

    this.progressCallback?.({
      storefrontId,
      storefrontName,
      status: 'processing',
      progress: 30,
      message: 'Fetching current products from Keepa...'
    })

    // Get current products from database
    const { data: currentProducts, error: productsError } = await this.supabase
      .from('products')
      .select('id, asin')
      .eq('storefront_id', storefrontId)

    if (productsError) {
      throw new Error(`Failed to fetch current products: ${productsError.message}`)
    }

    const currentASINs = new Set(currentProducts?.map(p => p.asin) || [])

    // Fetch ASINs from Keepa (this consumes the 50 tokens)
    const keepaASINs = await this.keepaApi.getAllSellerASINs(sellerId, 5) // Limit to 5 pages
    const keepaASINsSet = new Set(keepaASINs)

    this.progressCallback?.({
      storefrontId,
      storefrontName,
      status: 'processing',
      progress: 60,
      message: `Found ${keepaASINs.length} products in storefront`
    })

    // Find differences
    const asinsToAdd = keepaASINs.filter(asin => !currentASINs.has(asin))
    const asinsToRemove = Array.from(currentASINs).filter(asin => !keepaASINsSet.has(asin))

    console.log(`Storefront ${storefrontName}: +${asinsToAdd.length} -${asinsToRemove.length} products`)

    // Remove products that are no longer in the storefront
    if (asinsToRemove.length > 0) {
      this.progressCallback?.({
        storefrontId,
        storefrontName,
        status: 'processing',
        progress: 70,
        message: `Removing ${asinsToRemove.length} products...`
      })

      const { error: deleteError } = await this.supabase
        .from('products')
        .delete()
        .eq('storefront_id', storefrontId)
        .in('asin', asinsToRemove)

      if (deleteError) {
        console.error('Error removing products:', deleteError)
      }
    }

    // Add new products
    if (asinsToAdd.length > 0) {
      this.progressCallback?.({
        storefrontId,
        storefrontName,
        status: 'processing',
        progress: 80,
        message: `Adding ${asinsToAdd.length} new products...`
      })

      // Insert new products in batches and fetch details from Amazon
      const batchSize = 20 // Smaller batches for SP-API processing
      for (let i = 0; i < asinsToAdd.length; i += batchSize) {
        const batch = asinsToAdd.slice(i, i + batchSize)
        
        // First, insert basic product records
        const newProducts = batch.map(asin => ({
          asin,
          storefront_id: storefrontId,
          seller_id: sellerId,
          product_name: `Product ${asin}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        const { data: insertedProducts, error: insertError } = await this.supabase
          .from('products')
          .insert(newProducts)
          .select()

        if (insertError) {
          console.error(`Error adding batch ${Math.floor(i / batchSize) + 1}:`, insertError)
          continue
        }

        // Fetch product details from Amazon SP-API
        await this.updateProductDetailsFromAmazon(batch)
        
        this.progressCallback?.({
          storefrontId,
          storefrontName,
          status: 'processing',
          progress: 80 + (i / asinsToAdd.length) * 15,
          message: `Updated ${Math.min(i + batchSize, asinsToAdd.length)} of ${asinsToAdd.length} new products...`
        })
      }
    }

    // Update storefront metadata
    await this.supabase
      .from('storefronts')
      .update({
        last_sync_completed_at: new Date().toISOString(),
        last_sync_status: 'completed',
        total_products_synced: keepaASINs.length,
        keepa_tokens_consumed: (await this.supabase
          .from('storefronts')
          .select('keepa_tokens_consumed')
          .eq('id', storefrontId)
          .single()
        ).data?.keepa_tokens_consumed || 0 + tokensNeeded,
        updated_at: new Date().toISOString()
      })
      .eq('id', storefrontId)

    return {
      storefrontId,
      storefrontName,
      productsAdded: asinsToAdd.length,
      productsRemoved: asinsToRemove.length,
      tokensUsed: tokensNeeded,
      success: true
    }
  }

  /**
   * Get queue status for UI
   */
  async getQueueStatus(): Promise<{
    totalQueued: number
    processing: number
    completed: number
    errors: number
    availableTokens: number
  }> {
    const { data: queueStats } = await this.supabase
      .from('storefront_update_queue')
      .select('status')
      .eq('user_id', this.userId)

    const stats = {
      totalQueued: 0,
      processing: 0,
      completed: 0,
      errors: 0,
      availableTokens: 0
    }

    if (queueStats) {
      stats.totalQueued = queueStats.length
      stats.processing = queueStats.filter(item => item.status === 'processing').length
      stats.completed = queueStats.filter(item => item.status === 'completed').length
      stats.errors = queueStats.filter(item => item.status === 'error').length
    }

    stats.availableTokens = await this.rateLimiter.getAvailableTokens()

    return stats
  }

  /**
   * Cancel all pending updates
   */
  async cancelPendingUpdates(): Promise<void> {
    await this.supabase
      .from('storefront_update_queue')
      .update({ status: 'cancelled' })
      .eq('user_id', this.userId)
      .eq('status', 'pending')
  }

  /**
   * Clear completed and cancelled updates from queue
   */
  async clearCompletedUpdates(): Promise<void> {
    await this.supabase
      .from('storefront_update_queue')
      .delete()
      .eq('user_id', this.userId)
      .in('status', ['completed', 'cancelled', 'error'])
  }

  /**
   * Update product details from Amazon SP-API
   */
  private async updateProductDetailsFromAmazon(asins: string[]): Promise<void> {
    for (let i = 0; i < asins.length; i++) {
      const asin = asins[i]
      
      try {
        // Wait for rate limiter
        await this.spRateLimiter.acquire()
        
        // Fetch product details from Amazon SP-API
        const catalogItem = await this.spApi.getCatalogItem(asin)
        
        if (catalogItem) {
          // Extract product information
          const productName = AmazonSPAPISimple.extractProductName(catalogItem) || `Product ${asin}`
          const imageLink = AmazonSPAPISimple.extractMainImage(catalogItem)
          const brand = AmazonSPAPISimple.extractBrand(catalogItem)
          const salesRank = AmazonSPAPISimple.extractSalesRank(catalogItem)

          // Update product in database
          const { error: updateError } = await this.supabase
            .from('products')
            .update({
              product_name: productName,
              image_link: imageLink,
              brand: brand,
              current_sales_rank: salesRank,
              sales_per_month: salesRank ? this.estimateMonthlySalesFromRank(salesRank) : null,
              updated_at: new Date().toISOString()
            })
            .eq('asin', asin)

          if (updateError) {
            console.error(`Error updating product ${asin}:`, updateError)
          } else {
            console.log(`✓ Updated product details for ${asin}: ${productName}`)
          }
        } else {
          console.log(`⚠ No details found for ASIN ${asin}`)
        }

        // Add delay between requests (500ms = 2 req/sec)
        if (i < asins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error) {
        console.error(`Error fetching details for ASIN ${asin}:`, error)
        
        // Handle different types of errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase()
          const isSocketError = errorMessage.includes('socket hang up') || 
                               errorMessage.includes('econnreset') ||
                               errorMessage.includes('etimedout') ||
                               errorMessage.includes('enotfound')
          
          if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            console.log('Rate limit hit, waiting 60 seconds...')
            await new Promise(resolve => setTimeout(resolve, 60000))
            i-- // Retry this ASIN
          } else if (isSocketError) {
            console.log(`Socket error for ${asin}, will be retried automatically by SP-API client`)
            // The SP-API client now has retry logic built-in, so we don't need to retry here
          } else if (errorMessage.includes('403') || errorMessage.includes('access denied')) {
            console.error(`Access denied for ASIN ${asin} - check credentials`)
            // Don't retry access denied errors
          } else {
            console.log(`Unexpected error for ${asin}, continuing with next product`)
          }
        }
      }
    }
  }

  /**
   * Estimate monthly sales from UK sales rank
   */
  private estimateMonthlySalesFromRank(salesRank: number): number {
    if (salesRank <= 0) return 0
    
    // Rough estimation formula for UK marketplace
    // These are approximations based on industry data
    if (salesRank <= 100) return Math.floor(1000 - (salesRank * 8))
    if (salesRank <= 1000) return Math.floor(500 - (salesRank * 0.4))
    if (salesRank <= 10000) return Math.floor(200 - (salesRank * 0.015))
    if (salesRank <= 100000) return Math.floor(50 - (salesRank * 0.0003))
    if (salesRank <= 1000000) return Math.floor(10 - (salesRank * 0.000005))
    
    return 1 // Very low sales for ranks above 1M
  }
}