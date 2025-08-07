import { getServiceRoleClient } from '@/lib/supabase-server'
import { KeepaStorefrontAPI } from './keepa-storefront'
import { KeepaPersistentRateLimiter } from './keepa-persistent-rate-limiter'
import { AmazonSPAPISimple } from './amazon-sp-api-simple'
import { SPAPIRateLimiter } from './sp-api-rate-limiter'

interface SequentialUpdateResult {
  storefrontId: string
  storefrontName: string
  productsAdded: number
  productsRemoved: number
  tokensUsed: number
  success: boolean
  error?: string
  timestamp: Date
}

interface StorefrontData {
  id: string
  name: string
  seller_id: string
  keepa_tokens_consumed: number
}

interface SequentialUpdateProgress {
  isProcessing: boolean
  totalStorefronts: number
  processedStorefronts: number
  currentStorefront?: string
  nextStorefrontTime?: Date
  completedStorefronts: SequentialUpdateResult[]
  tokensUsed: number
  tokensAvailable: number
  startTime: Date
  estimatedEndTime?: Date
}

export class KeepaSequentialManager {
  private userId: string
  private rateLimiter: KeepaPersistentRateLimiter
  private keepaApi: KeepaStorefrontAPI
  private spApi: AmazonSPAPISimple
  private spRateLimiter: SPAPIRateLimiter
  private supabase = getServiceRoleClient()
  private static processingStatus = new Map<string, SequentialUpdateProgress>()
  private abortController?: AbortController
  
  // Configuration
  private readonly TOKENS_PER_STOREFRONT = 50
  private readonly INTERVAL_BETWEEN_SCANS_MS = 3 * 60 * 1000 // 3 minutes
  private readonly INITIAL_TOKENS_REQUIRED = 50

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

  async startSequentialUpdate(storefrontIds: string[], options: { 
    fetchTitlesImmediately?: boolean 
  } = {}): Promise<{ message: string; details: any }> {
    console.log(`🚀 Starting sequential update for ${storefrontIds.length} storefronts`)
    
    // Check if already processing
    const currentProgress = KeepaSequentialManager.processingStatus.get(this.userId)
    if (currentProgress && currentProgress.isProcessing) {
      return {
        message: 'Sequential update already in progress',
        details: currentProgress
      }
    }

    // Get all storefront details
    const { data: storefronts, error } = await this.supabase
      .from('storefronts')
      .select('*')
      .in('id', storefrontIds)
      .eq('user_id', this.userId)
      .order('name', { ascending: true })

    if (error || !storefronts) {
      throw new Error(`Failed to fetch storefronts: ${error?.message}`)
    }

    // Check initial token availability
    const availableTokens = await this.rateLimiter.getAvailableTokens()
    console.log(`📊 Available tokens: ${availableTokens}`)
    
    if (availableTokens < this.INITIAL_TOKENS_REQUIRED) {
      const tokensShort = this.INITIAL_TOKENS_REQUIRED - availableTokens
      const waitMinutes = Math.ceil(tokensShort / 22) // 22 tokens per minute refill rate
      
      return {
        message: `Not enough tokens to start. Need ${this.INITIAL_TOKENS_REQUIRED}, have ${availableTokens}`,
        details: {
          tokensNeeded: this.INITIAL_TOKENS_REQUIRED,
          tokensAvailable: availableTokens,
          estimatedWaitMinutes: waitMinutes
        }
      }
    }

    // Initialize progress tracking
    const progress: SequentialUpdateProgress = {
      isProcessing: true,
      totalStorefronts: storefronts.length,
      processedStorefronts: 0,
      completedStorefronts: [],
      tokensUsed: 0,
      tokensAvailable: availableTokens,
      startTime: new Date(),
      estimatedEndTime: new Date(Date.now() + (storefronts.length * this.INTERVAL_BETWEEN_SCANS_MS))
    }
    
    KeepaSequentialManager.processingStatus.set(this.userId, progress)
    
    // Start sequential processing in background
    this.processSequentially(storefronts, options).catch(error => {
      console.error('❌ Error in sequential processing:', error)
      const progress = KeepaSequentialManager.processingStatus.get(this.userId)
      if (progress) {
        progress.isProcessing = false
      }
    })

    return {
      message: `Sequential update started for ${storefronts.length} storefronts`,
      details: {
        totalStorefronts: storefronts.length,
        intervalBetweenScans: '3 minutes',
        estimatedTotalTime: `${Math.ceil(storefronts.length * 3)} minutes`,
        storefronts: storefronts.map(s => ({ id: s.id, name: s.name }))
      }
    }
  }

  private async processSequentially(storefronts: StorefrontData[], options: { 
    fetchTitlesImmediately?: boolean 
  }) {
    console.log(`🔄 Starting sequential processing of ${storefronts.length} storefronts`)
    this.abortController = new AbortController()
    
    const progress = KeepaSequentialManager.processingStatus.get(this.userId)!
    
    for (let i = 0; i < storefronts.length; i++) {
      // Check if aborted
      if (this.abortController.signal.aborted) {
        console.log('⛔ Sequential update aborted by user')
        break
      }

      const storefront = storefronts[i]
      progress.currentStorefront = storefront.name
      
      // Calculate next storefront time if not the last one
      if (i < storefronts.length - 1) {
        progress.nextStorefrontTime = new Date(Date.now() + this.INTERVAL_BETWEEN_SCANS_MS)
      } else {
        progress.nextStorefrontTime = undefined
      }

      console.log(`\n📦 Processing storefront ${i + 1}/${storefronts.length}: ${storefront.name}`)
      
      try {
        // Check token availability before each scan
        const currentTokens = await this.rateLimiter.getAvailableTokens()
        progress.tokensAvailable = currentTokens
        
        if (currentTokens < this.TOKENS_PER_STOREFRONT) {
          console.log(`⚠️ Not enough tokens (${currentTokens}/${this.TOKENS_PER_STOREFRONT}). Waiting...`)
          
          // Wait for tokens to refill (22 per minute)
          const tokensNeeded = this.TOKENS_PER_STOREFRONT - currentTokens
          const waitTime = Math.ceil(tokensNeeded / 22) * 60 * 1000
          
          console.log(`⏳ Waiting ${Math.ceil(waitTime / 60000)} minutes for tokens to refill...`)
          await this.delay(waitTime)
          
          // Re-check tokens after waiting
          const newTokens = await this.rateLimiter.getAvailableTokens()
          progress.tokensAvailable = newTokens
          console.log(`✅ Tokens refilled: ${newTokens}`)
        }

        // Reserve tokens for this storefront
        await this.rateLimiter.consumeTokens(this.TOKENS_PER_STOREFRONT)
        
        // Process the storefront
        const result = await this.updateSingleStorefront(storefront, options)
        
        // Update progress
        progress.processedStorefronts++
        progress.tokensUsed += result.tokensUsed
        progress.completedStorefronts.push(result)
        progress.currentStorefront = undefined
        
        // Update token availability after processing
        const remainingTokens = await this.rateLimiter.getAvailableTokens()
        progress.tokensAvailable = remainingTokens
        
        console.log(`✅ Completed ${storefront.name}: +${result.productsAdded} -${result.productsRemoved} products`)
        console.log(`📊 Progress: ${progress.processedStorefronts}/${progress.totalStorefronts} storefronts`)
        console.log(`🪙 Tokens: ${remainingTokens} available, ${progress.tokensUsed} used total`)
        
        // Wait 3 minutes before next storefront (unless it's the last one)
        if (i < storefronts.length - 1) {
          console.log(`⏰ Waiting 3 minutes before next storefront...`)
          await this.delay(this.INTERVAL_BETWEEN_SCANS_MS)
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${storefront.name}:`, error)
        
        // Add failed result to progress
        progress.processedStorefronts++
        progress.completedStorefronts.push({
          storefrontId: storefront.id,
          storefrontName: storefront.name,
          productsAdded: 0,
          productsRemoved: 0,
          tokensUsed: this.TOKENS_PER_STOREFRONT, // Tokens were likely consumed
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        })
        
        // Continue with next storefront after delay
        if (i < storefronts.length - 1) {
          console.log(`⏰ Waiting 3 minutes before next storefront...`)
          await this.delay(this.INTERVAL_BETWEEN_SCANS_MS)
        }
      }
    }
    
    // Mark processing as complete
    progress.isProcessing = false
    progress.currentStorefront = undefined
    progress.nextStorefrontTime = undefined
    
    const successful = progress.completedStorefronts.filter(r => r.success).length
    const failed = progress.completedStorefronts.filter(r => !r.success).length
    const totalProductsAdded = progress.completedStorefronts.reduce((sum, r) => sum + r.productsAdded, 0)
    const totalProductsRemoved = progress.completedStorefronts.reduce((sum, r) => sum + r.productsRemoved, 0)
    
    console.log(`\n🎉 Sequential update completed!`)
    console.log(`📈 Results: ${successful} successful, ${failed} failed`)
    console.log(`📊 Total: +${totalProductsAdded} products, -${totalProductsRemoved} products`)
    console.log(`🪙 Total tokens used: ${progress.tokensUsed}`)
    
    // Auto-trigger background title enrichment if products were added and not fetched immediately
    if (totalProductsAdded > 0 && !options.fetchTitlesImmediately) {
      console.log(`🔍 Auto-triggering background title enrichment for ${totalProductsAdded} new products`)
      this.triggerBackgroundEnrichment()
    }
  }

  private async updateSingleStorefront(storefront: StorefrontData, options: { 
    fetchTitlesImmediately?: boolean 
  }): Promise<SequentialUpdateResult> {
    const { id: storefrontId, name: storefrontName, seller_id: sellerId } = storefront
    const startTime = Date.now()

    try {
      console.log(`🔄 Starting update for ${storefrontName} (${sellerId})`)
      
      // STEP 1: Get current products from database
      console.log(`📋 Fetching current products from database...`)
      const { data: currentProducts, error: fetchError } = await this.supabase
        .from('products')
        .select('asin')
        .eq('storefront_id', storefrontId)

      if (fetchError) {
        throw new Error(`Database fetch error: ${fetchError.message}`)
      }

      const currentASINs = new Set(currentProducts?.map(p => p.asin) || [])
      console.log(`📊 Current products in DB: ${currentASINs.size} ASINs`)

      // STEP 2: Fetch all ASINs from Keepa (this is where the 50 tokens are spent)
      console.log(`🔍 Fetching ASINs from Keepa API for seller ${sellerId}...`)
      const keepaResult = await this.keepaApi.getSellerASINs(sellerId, 0)
      const keepaASINs = keepaResult.asinList
      const keepaASINsSet = new Set(keepaASINs)
      
      console.log(`✅ Keepa returned ${keepaASINs.length} ASINs`)
      
      // Update our token tracker with real Keepa data
      if (keepaResult.tokenInfo) {
        console.log(`📊 Keepa tokens: ${keepaResult.tokenInfo.tokensLeft} remaining, ${keepaResult.tokenInfo.tokensConsumed} consumed`)
        await this.updateTokenTracker(keepaResult.tokenInfo)
      }

      // STEP 3: Find differences - NEW and OLD ASINs
      const asinsToAdd = keepaASINs.filter(asin => !currentASINs.has(asin))
      const asinsToRemove = Array.from(currentASINs).filter(asin => !keepaASINsSet.has(asin))

      console.log(`📈 Changes detected: +${asinsToAdd.length} new ASINs, -${asinsToRemove.length} old ASINs`)

      // STEP 4: Remove products no longer in storefront
      if (asinsToRemove.length > 0) {
        console.log(`🗑️ Removing ${asinsToRemove.length} old ASINs from database...`)
        const { error: deleteError } = await this.supabase
          .from('products')
          .delete()
          .eq('storefront_id', storefrontId)
          .in('asin', asinsToRemove)

        if (deleteError) {
          console.error(`⚠️ Error removing old products: ${deleteError.message}`)
        } else {
          console.log(`✅ Successfully removed ${asinsToRemove.length} old ASINs`)
        }
      }

      // STEP 5: Add new products
      if (asinsToAdd.length > 0) {
        console.log(`➕ Adding ${asinsToAdd.length} new ASINs to database...`)
        const newProducts = asinsToAdd.map(asin => ({
          asin,
          storefront_id: storefrontId,
          seller_id: sellerId,
          product_name: 'Loading...', // Placeholder until Amazon SP-API enrichment
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        // Insert in batches to avoid query size limits
        const insertBatchSize = 1000
        let insertedCount = 0
        for (let i = 0; i < newProducts.length; i += insertBatchSize) {
          const batch = newProducts.slice(i, i + insertBatchSize)
          const { error: insertError } = await this.supabase
            .from('products')
            .upsert(batch, { 
              onConflict: 'asin,storefront_id',
              ignoreDuplicates: true 
            })

          if (insertError) {
            console.error(`⚠️ Error inserting batch: ${insertError.message}`)
          } else {
            insertedCount += batch.length
            console.log(`✅ Inserted batch: ${insertedCount}/${newProducts.length} ASINs`)
          }
        }

        // STEP 6: Fetch product details from Amazon SP-API
        if (options.fetchTitlesImmediately) {
          console.log(`🔍 Fetching product details from Amazon SP-API for ${asinsToAdd.length} ASINs...`)
          await this.enrichProductTitles(asinsToAdd)
        } else {
          console.log(`📝 Queuing ${asinsToAdd.length} ASINs for background enrichment`)
          await this.queueASINsForTitleEnrichment(asinsToAdd)
        }
      }

      // STEP 7: Update storefront metadata
      console.log(`📊 Updating storefront metadata...`)
      const { error: updateError } = await this.supabase
        .from('storefronts')
        .update({
          last_sync_completed_at: new Date().toISOString(),
          last_sync_status: 'completed',
          total_products_synced: keepaASINs.length,
          keepa_tokens_consumed: (storefront.keepa_tokens_consumed || 0) + 50,
          new_products_last_scan: asinsToAdd.length,
          removed_products_last_scan: asinsToRemove.length,
          updated_at: new Date().toISOString()
        })
        .eq('id', storefrontId)

      if (updateError) {
        console.error(`⚠️ Error updating storefront metadata: ${updateError.message}`)
      }

      const processingTime = (Date.now() - startTime) / 1000
      console.log(`✅ Successfully processed ${storefrontName} in ${processingTime.toFixed(1)}s`)
      console.log(`📊 Final stats: ${keepaASINs.length} total products, +${asinsToAdd.length} new, -${asinsToRemove.length} removed`)

      return {
        storefrontId,
        storefrontName,
        productsAdded: asinsToAdd.length,
        productsRemoved: asinsToRemove.length,
        tokensUsed: 50,
        success: true,
        timestamp: new Date()
      }
    } catch (error) {
      console.error(`❌ Error updating storefront ${storefrontName}:`, error)
      return {
        storefrontId,
        storefrontName,
        productsAdded: 0,
        productsRemoved: 0,
        tokensUsed: 50, // Tokens were likely consumed even on error
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
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

    // Insert in batches
    const batchSize = 1000
    for (let i = 0; i < queueItems.length; i += batchSize) {
      const batch = queueItems.slice(i, i + batchSize)
      await this.supabase
        .from('asin_enrichment_queue')
        .upsert(batch, { 
          onConflict: 'asin',
          ignoreDuplicates: true 
        })
    }
  }

  private async enrichProductTitles(asins: string[]): Promise<void> {
    console.log(`🚀 Starting Amazon SP-API enrichment for ${asins.length} ASINs`)
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < asins.length; i++) {
      const asin = asins[i]
      
      try {
        // Respect SP-API rate limits (2 requests/second for catalog API)
        await this.spRateLimiter.acquire()
        
        console.log(`📦 [${i + 1}/${asins.length}] Fetching details for ASIN: ${asin}`)
        const catalogItem = await this.spApi.getCatalogItem(asin)
        
        if (catalogItem) {
          // Extract product information from Amazon SP-API response
          const productName = AmazonSPAPISimple.extractProductName(catalogItem) || `Product ${asin}`
          const imageLink = AmazonSPAPISimple.extractMainImage(catalogItem)
          const brand = AmazonSPAPISimple.extractBrand(catalogItem)
          const category = AmazonSPAPISimple.extractCategory?.(catalogItem)
          const salesRank = AmazonSPAPISimple.extractSalesRank?.(catalogItem)

          // Update product in database with Amazon data
          const { error: updateError } = await this.supabase
            .from('products')
            .update({
              product_name: productName,
              image_link: imageLink,
              brand: brand,
              category: category,
              current_sales_rank: salesRank,
              // Calculate estimated sales if we have sales rank
              sales_per_month: salesRank ? this.estimateMonthlySalesFromRank(salesRank) : null,
              updated_at: new Date().toISOString()
            })
            .eq('asin', asin)

          if (updateError) {
            console.error(`⚠️ Database update error for ${asin}: ${updateError.message}`)
            errorCount++
          } else {
            console.log(`✅ Updated ${asin}: ${productName.substring(0, 50)}...`)
            successCount++
          }
        } else {
          console.log(`⚠️ No catalog data found for ASIN ${asin}`)
          errorCount++
        }

        // Add delay between requests (500ms = 2 requests/second)
        if (i < asins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } catch (error) {
        console.error(`❌ Error fetching details for ASIN ${asin}:`, error)
        errorCount++
        
        // Handle rate limit errors with longer wait
        if (error instanceof Error && error.message.includes('429')) {
          console.log('⏳ SP-API rate limit hit, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
          i-- // Retry this ASIN
          errorCount-- // Don't count this as an error since we're retrying
        }
      }
      
      // Progress update every 10 items
      if ((i + 1) % 10 === 0 || i === asins.length - 1) {
        console.log(`📊 Progress: ${i + 1}/${asins.length} ASINs processed (${successCount} success, ${errorCount} errors)`)
      }
    }
    
    console.log(`✅ Amazon SP-API enrichment completed: ${successCount} successful, ${errorCount} errors`)
  }

  private estimateMonthlySalesFromRank(salesRank: number): number {
    if (salesRank <= 0) return 0
    
    // UK marketplace estimation formula
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
      await this.supabase
        .from('keepa_token_tracker')
        .update({
          available_tokens: tokenInfo.tokensLeft,
          last_refill_at: new Date(tokenInfo.timestamp).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', this.userId)
    } catch (error) {
      console.error('Error updating token tracker:', error)
    }
  }

  private async triggerBackgroundEnrichment() {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/enrich-titles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      })
      
      if (response.ok) {
        console.log(`✅ Background title enrichment started`)
      } else {
        console.log(`⚠️ Failed to start background enrichment`)
      }
    } catch (error) {
      console.error(`❌ Error triggering enrichment:`, error)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async stopSequentialUpdate(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
    }
    
    const progress = KeepaSequentialManager.processingStatus.get(this.userId)
    if (progress) {
      progress.isProcessing = false
      progress.currentStorefront = undefined
      progress.nextStorefrontTime = undefined
    }
  }

  static getProgress(userId: string): SequentialUpdateProgress | undefined {
    return KeepaSequentialManager.processingStatus.get(userId)
  }

  async getTokenStatus() {
    const availableTokens = await this.rateLimiter.getAvailableTokens()
    const tokenRefillRate = 22 // tokens per minute
    
    return {
      availableTokens,
      tokenRefillRate,
      canProcessNow: availableTokens >= this.TOKENS_PER_STOREFRONT,
      timeToNextScan: availableTokens < this.TOKENS_PER_STOREFRONT 
        ? Math.ceil((this.TOKENS_PER_STOREFRONT - availableTokens) / tokenRefillRate)
        : 0
    }
  }
}