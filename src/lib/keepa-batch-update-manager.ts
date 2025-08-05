import { getServiceRoleClient } from '@/lib/supabase-server'
import { KeepaStorefrontAPI } from './keepa-storefront'
import { KeepaPersistentRateLimiter } from './keepa-persistent-rate-limiter'
import { AmazonSPAPISimple } from './amazon-sp-api-simple'
import { SPAPIRateLimiter } from './sp-api-rate-limiter'


interface BatchUpdateResult {
  storefrontId: string
  storefrontName: string
  productsAdded: number
  productsRemoved: number
  tokensUsed: number
  success: boolean
  error?: string
}

interface StorefrontData {
  id: string
  name: string
  seller_id: string
  keepa_tokens_consumed: number
}

export class KeepaBatchUpdateManager {
  private userId: string
  private rateLimiter: KeepaPersistentRateLimiter
  private keepaApi: KeepaStorefrontAPI
  private spApi: AmazonSPAPISimple
  private spRateLimiter: SPAPIRateLimiter
  private supabase = getServiceRoleClient()

  constructor(userId: string) {
    this.userId = userId
    this.rateLimiter = new KeepaPersistentRateLimiter(userId)

    const keepaApiKey = process.env.KEEPA_API_KEY
    if (!keepaApiKey) {
      throw new Error('Keepa API key not configured in environment variables')
    }
    
    const keepaDomain = parseInt(process.env.KEEPA_DOMAIN || '2')
    this.keepaApi = new KeepaStorefrontAPI(keepaApiKey, keepaDomain)

    // Initialize Amazon SP-API
    const amazonAccessKey = process.env.AMAZON_ACCESS_KEY_ID
    const amazonSecretKey = process.env.AMAZON_SECRET_ACCESS_KEY
    const amazonRefreshToken = process.env.AMAZON_REFRESH_TOKEN
    const amazonMarketplaceId = process.env.AMAZON_MARKETPLACE_ID

    if (!amazonAccessKey || !amazonSecretKey || !amazonRefreshToken || !amazonMarketplaceId) {
      throw new Error('Amazon SP-API credentials not configured')
    }

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

  async processBatchUpdate(storefrontIds: string[], options: { 
    fetchTitlesImmediately?: boolean 
  } = {}): Promise<BatchUpdateResult[]> {
    console.log(`🚀 Starting batch update for ${storefrontIds.length} storefronts`)
    
    // Get all storefront details
    const { data: storefronts, error } = await this.supabase
      .from('storefronts')
      .select('*')
      .in('id', storefrontIds)
      .eq('user_id', this.userId)

    if (error || !storefronts) {
      throw new Error(`Failed to fetch storefronts: ${error?.message}`)
    }

    // Check available tokens
    const availableTokens = await this.rateLimiter.getAvailableTokens()
    const tokensPerStorefront = 50
    
    // Calculate how many storefronts we can process
    const maxStorefronts = Math.floor(availableTokens / tokensPerStorefront)
    const storefrontsToProcess = Math.min(maxStorefronts, storefronts.length)
    
    console.log(`📊 Processing ${storefrontsToProcess} of ${storefronts.length} storefronts with ${availableTokens} tokens`)

    if (storefrontsToProcess === 0) {
      throw new Error(`Not enough tokens. Need ${tokensPerStorefront}, have ${availableTokens}`)
    }

    // Select storefronts to process now
    const batchStorefronts = storefronts.slice(0, storefrontsToProcess)
    
    // Reserve tokens for all storefronts at once
    const totalTokensNeeded = storefrontsToProcess * tokensPerStorefront
    await this.rateLimiter.consumeTokens(totalTokensNeeded)
    
    console.log(`🪙 Reserved ${totalTokensNeeded} tokens for parallel processing`)

    // Process all storefronts in parallel
    const startTime = Date.now()
    const batchPromises = batchStorefronts.map(storefront => 
      this.updateSingleStorefront(storefront, options)
    )

    console.log(`⚡ Starting ${batchStorefronts.length} parallel Keepa requests...`)
    const results = await Promise.all(batchPromises)
    
    const endTime = Date.now()
    const totalTime = (endTime - startTime) / 1000
    
    console.log(`✅ Batch completed in ${totalTime}s`)
    console.log(`📈 Added ${results.reduce((sum, r) => sum + r.productsAdded, 0)} products`)
    console.log(`📉 Removed ${results.reduce((sum, r) => sum + r.productsRemoved, 0)} products`)

    return results
  }

  private async updateSingleStorefront(storefront: StorefrontData, options: { 
    fetchTitlesImmediately?: boolean 
  } = {}): Promise<BatchUpdateResult> {
    const { id: storefrontId, name: storefrontName, seller_id: sellerId } = storefront

    try {
      console.log(`🔄 Updating storefront: ${storefrontName}`)

      // Get current products from database
      const { data: currentProducts } = await this.supabase
        .from('products')
        .select('asin')
        .eq('storefront_id', storefrontId)

      const currentASINs = new Set(currentProducts?.map(p => p.asin) || [])

      // Fetch all ASINs from Keepa (this is where the 50 tokens are spent)
      const keepaResult = await this.keepaApi.getSellerASINs(sellerId, 0)
      const keepaASINs = keepaResult.asinList
      const keepaASINsSet = new Set(keepaASINs)
      
      // Update our token tracker with real Keepa data
      if (keepaResult.tokenInfo) {
        console.log(`📊 Keepa token update: ${keepaResult.tokenInfo.tokensLeft} left, consumed ${keepaResult.tokenInfo.tokensConsumed}`)
        await this.updateTokenTracker(keepaResult.tokenInfo)
      }

      console.log(`📦 ${storefrontName}: Found ${keepaASINs.length} products from Keepa`)

      // Find differences
      const asinsToAdd = keepaASINs.filter(asin => !currentASINs.has(asin))
      const asinsToRemove = Array.from(currentASINs).filter(asin => !keepaASINsSet.has(asin))

      console.log(`📊 ${storefrontName}: +${asinsToAdd.length} -${asinsToRemove.length} products`)

      // Remove products no longer in storefront
      if (asinsToRemove.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('products')
          .delete()
          .eq('storefront_id', storefrontId)
          .in('asin', asinsToRemove)

        if (deleteError) {
          console.error(`❌ Error removing products from ${storefrontName}:`, deleteError)
        }
      }

      // Add new products with placeholder titles
      if (asinsToAdd.length > 0) {
        const newProducts = asinsToAdd.map(asin => ({
          asin,
          storefront_id: storefrontId,
          seller_id: sellerId,
          product_name: 'Loading...', // Placeholder - will be enriched later
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        // Insert in batches to avoid query size limits
        const insertBatchSize = 1000
        for (let i = 0; i < newProducts.length; i += insertBatchSize) {
          const batch = newProducts.slice(i, i + insertBatchSize)
          const { error: insertError } = await this.supabase
            .from('products')
            .upsert(batch, { 
              onConflict: 'asin,storefront_id',
              ignoreDuplicates: true 
            })

          if (insertError) {
            console.error(`❌ Error inserting batch for ${storefrontName}:`, insertError)
          }
        }

        // Handle title fetching based on options
        if (options.fetchTitlesImmediately) {
          console.log(`🔍 Fetching titles immediately for ${asinsToAdd.length} ASINs`)
          await this.enrichProductTitles(asinsToAdd)
        } else {
          // Queue these ASINs for title enrichment
          await this.queueASINsForTitleEnrichment(asinsToAdd)
          console.log(`📝 Queued ${asinsToAdd.length} ASINs for title enrichment`)
        }
      }

      // Update storefront metadata
      await this.supabase
        .from('storefronts')
        .update({
          last_sync_completed_at: new Date().toISOString(),
          last_sync_status: 'completed',
          total_products_synced: keepaASINs.length,
          keepa_tokens_consumed: (storefront.keepa_tokens_consumed || 0) + 50,
          updated_at: new Date().toISOString()
        })
        .eq('id', storefrontId)

      return {
        storefrontId,
        storefrontName,
        productsAdded: asinsToAdd.length,
        productsRemoved: asinsToRemove.length,
        tokensUsed: 50,
        success: true
      }
    } catch (error) {
      console.error(`❌ Error updating storefront ${storefrontName}:`, error)
      return {
        storefrontId,
        storefrontName,
        productsAdded: 0,
        productsRemoved: 0,
        tokensUsed: 50, // Tokens were still consumed even on error
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async queueASINsForTitleEnrichment(asins: string[]) {
    if (asins.length === 0) return

    const queueItems = asins.map(asin => ({
      asin,
      user_id: this.userId,
      status: 'pending' as const,
      created_at: new Date().toISOString()
    }))

    // Insert in batches to avoid query limits
    const batchSize = 1000
    for (let i = 0; i < queueItems.length; i += batchSize) {
      const batch = queueItems.slice(i, i + batchSize)
      const { error } = await this.supabase
        .from('asin_enrichment_queue')
        .upsert(batch, { 
          onConflict: 'asin',
          ignoreDuplicates: true 
        })

      if (error) {
        console.error('Error queuing ASINs for enrichment:', error)
      }
    }
  }

  async getTokenStatus() {
    const availableTokens = await this.rateLimiter.getAvailableTokens()
    const tokenRefillRate = 22 // tokens per minute
    
    return {
      availableTokens,
      tokenRefillRate,
      maxStorefrontsNow: Math.floor(availableTokens / 50),
      timeToNext50Tokens: availableTokens < 50 ? Math.ceil((50 - availableTokens) / tokenRefillRate) : 0
    }
  }

  async getEnrichmentQueueStatus() {
    const { data: stats } = await this.supabase
      .from('asin_enrichment_queue')
      .select('status')
      .eq('user_id', this.userId)

    const queueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
      total: 0
    }

    if (stats) {
      queueStats.total = stats.length
      stats.forEach(item => {
        queueStats[item.status as keyof typeof queueStats]++
      })
    }

    return queueStats
  }

  private async enrichProductTitles(asins: string[]): Promise<void> {
    console.log(`🔍 Starting immediate title enrichment for ${asins.length} ASINs`)
    
    for (let i = 0; i < asins.length; i++) {
      const asin = asins[i]
      
      try {
        // Wait for rate limiter
        await this.spRateLimiter.acquire()
        
        // Fetch product details from Amazon SP-API
        const catalogItem = await this.spApi.getCatalogItem(asin)
        
        if (catalogItem) {
          // Extract only title, image, and brand from Amazon SP-API  
          // (Sales data comes from Keepa, not Amazon)
          const productName = AmazonSPAPISimple.extractProductName(catalogItem) || `Product ${asin}`
          const imageLink = AmazonSPAPISimple.extractMainImage(catalogItem)
          const brand = AmazonSPAPISimple.extractBrand(catalogItem)

          // Update product in database with only Amazon SP-API data
          const { error: updateError } = await this.supabase
            .from('products')
            .update({
              product_name: productName,
              image_link: imageLink,
              brand: brand,
              updated_at: new Date().toISOString()
            })
            .eq('asin', asin)

          if (updateError) {
            console.error(`❌ Error updating product ${asin}:`, updateError)
          } else {
            console.log(`✅ Updated product details for ${asin}: ${productName}`)
          }
        } else {
          console.log(`⚠️ No details found for ASIN ${asin}`)
        }

        // Add delay between requests (500ms = 2 req/sec)
        if (i < asins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error) {
        console.error(`❌ Error fetching details for ASIN ${asin}:`, error)
        
        // On rate limit errors, wait longer
        if (error instanceof Error && error.message.includes('429')) {
          console.log('⏳ Rate limit hit, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
          i-- // Retry this ASIN
        }
      }
    }
  }

  private estimateMonthlySalesFromRank(salesRank: number): number {
    if (salesRank <= 0) return 0
    
    // Rough estimation formula for UK marketplace
    if (salesRank <= 100) return Math.floor(1000 - (salesRank * 8))
    if (salesRank <= 1000) return Math.floor(500 - (salesRank * 0.4))
    if (salesRank <= 10000) return Math.floor(200 - (salesRank * 0.015))
    if (salesRank <= 100000) return Math.floor(50 - (salesRank * 0.0003))
    if (salesRank <= 1000000) return Math.floor(10 - (salesRank * 0.000005))
    
    return 1 // Very low sales for ranks above 1M
  }

  private async updateTokenTracker(tokenInfo: {
    tokensLeft: number;
    tokensConsumed: number;
    tokenFlowReduction: number;
    timestamp: number;
  }) {
    try {
      // Update the database token tracker with real Keepa data
      const { error } = await this.supabase
        .from('keepa_token_tracker')
        .update({
          available_tokens: tokenInfo.tokensLeft,
          last_refill_at: new Date(tokenInfo.timestamp).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId)

      if (error) {
        console.error('Error updating token tracker:', error)
      } else {
        console.log(`✅ Token tracker updated: ${tokenInfo.tokensLeft} tokens available`)
      }
    } catch (error) {
      console.error('Error updating token tracker:', error)
    }
  }
}