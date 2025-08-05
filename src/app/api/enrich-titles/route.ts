import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { getServiceRoleClient } from '@/lib/supabase-server'
import { AmazonSPAPISimple } from '@/lib/amazon-sp-api-simple'
import { SPAPIRateLimiter } from '@/lib/sp-api-rate-limiter'

// Global processing state to prevent multiple concurrent enrichment processes
let isEnriching = false

export async function POST(request: NextRequest) {
  console.log('📝 Title enrichment endpoint called')
  
  try {
    // Verify authentication (allow user, cron, and service role requests)
    const authHeader = request.headers.get('authorization')
    const cronSecret = request.headers.get('x-cron-secret')
    
    console.log('🔐 Auth header present:', !!authHeader)
    console.log('🔐 Cron secret present:', !!cronSecret)
    
    let userId: string | null = null
    
    if (cronSecret === process.env.CRON_SECRET) {
      // Cron job request - process for all users
      console.log('🤖 Cron job request detected')
    } else if (authHeader && authHeader.startsWith('Bearer ') && authHeader.substring(7) === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Service role request - process for all users
      console.log('🔧 Service role request detected')
    } else {
      // Regular user request
      const { user } = await requireAuth()
      if (!user) {
        return unauthorizedResponse()
      }
      userId = user.id
      console.log('👤 User request:', userId)
    }

    // Prevent multiple concurrent enrichment processes
    if (isEnriching) {
      console.log('⚠️ Title enrichment already in progress')
      return NextResponse.json({ 
        message: 'Title enrichment process is already running. Please wait for it to complete.',
        error: 'Enrichment already in progress'
      }, { status: 409 })
    }

    // Start enrichment in background
    setImmediate(async () => {
      isEnriching = true
      try {
        await processTitleEnrichment(userId)
      } catch (error) {
        console.error('❌ Error in title enrichment process:', error)
      } finally {
        isEnriching = false
      }
    })

    return NextResponse.json({ 
      message: 'Title enrichment process started in background',
      processing: true
    }, { status: 200 })

  } catch (error) {
    console.error('Error starting title enrichment:', error)
    return serverErrorResponse('Failed to start title enrichment')
  }
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Get enrichment queue status
    const supabase = getServiceRoleClient()
    const { data: stats } = await supabase
      .from('asin_enrichment_queue')
      .select('status')
      .eq('user_id', user.id)

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

    return NextResponse.json({
      isProcessing: isEnriching,
      queue: queueStats
    })

  } catch (error) {
    console.error('Error getting enrichment status:', error)
    return serverErrorResponse('Failed to get enrichment status')
  }
}

async function processTitleEnrichment(userId: string | null) {
  console.log('🚀 Starting title enrichment process')

  // Initialize Supabase client
  const supabase = getServiceRoleClient()

  // Initialize Amazon SP-API
  const amazonAccessKey = process.env.AMAZON_ACCESS_KEY_ID
  const amazonSecretKey = process.env.AMAZON_SECRET_ACCESS_KEY
  const amazonRefreshToken = process.env.AMAZON_REFRESH_TOKEN
  const amazonMarketplaceId = process.env.AMAZON_MARKETPLACE_ID

  if (!amazonAccessKey || !amazonSecretKey || !amazonRefreshToken || !amazonMarketplaceId) {
    throw new Error('Amazon SP-API credentials not configured')
  }

  const spApi = new AmazonSPAPISimple({
    clientId: amazonAccessKey,
    clientSecret: amazonSecretKey,
    refreshToken: amazonRefreshToken,
    region: 'eu',
    marketplaceId: amazonMarketplaceId
  })

  // Initialize SP-API rate limiter (2 requests/second for catalog items)
  const spRateLimiter = new SPAPIRateLimiter({
    requestsPerSecond: 2,
    burstCapacity: 2
  })

  let processedCount = 0
  let errorCount = 0
  const batchSize = 50 // Process 50 ASINs at a time

  while (true) {
    // Get next batch of pending ASINs
    const query = supabase
      .from('asin_enrichment_queue')
      .select('id, asin, attempts')
      .eq('status', 'pending')
      .lt('attempts', 3) // Skip ASINs that have failed 3+ times
      .order('created_at', { ascending: true })
      .limit(batchSize)

    // Filter by user if specified
    if (userId) {
      query.eq('user_id', userId)
    }

    const { data: pendingItems, error } = await query

    if (error) {
      console.error('❌ Error fetching pending ASINs:', error)
      break
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log('✅ No more pending ASINs to process')
      break
    }

    console.log(`📝 Processing batch of ${pendingItems.length} ASINs`)

    // Process each ASIN
    for (const item of pendingItems) {
      try {
        // Mark as processing
        await supabase
          .from('asin_enrichment_queue')
          .update({ 
            status: 'processing',
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        // Wait for rate limiter
        await spRateLimiter.acquire()

        // Fetch product details from Amazon SP-API
        const catalogItem = await spApi.getCatalogItem(item.asin)

        if (catalogItem) {
          // Extract only title, image, and brand from Amazon SP-API
          // (Sales data comes from Keepa, not Amazon)
          const productName = AmazonSPAPISimple.extractProductName(catalogItem) || `Product ${item.asin}`
          const imageLink = AmazonSPAPISimple.extractMainImage(catalogItem)
          const brand = AmazonSPAPISimple.extractBrand(catalogItem)

          // Update product in database with only Amazon SP-API data
          const { error: updateError } = await supabase
            .from('products')
            .update({
              product_name: productName,
              image_link: imageLink,
              brand: brand,
              updated_at: new Date().toISOString()
            })
            .eq('asin', item.asin)

          if (updateError) {
            console.error(`❌ Error updating product ${item.asin}:`, updateError)
            throw updateError
          }

          // Mark as completed
          await supabase
            .from('asin_enrichment_queue')
            .update({ 
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id)

          console.log(`✅ Enriched title for ${item.asin}: ${productName}`)
          processedCount++

        } else {
          console.log(`⚠️ No details found for ASIN ${item.asin}`)
          
          // Mark as completed even if no data found
          await supabase
            .from('asin_enrichment_queue')
            .update({ 
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id)
        }

        // Add delay between requests (500ms = 2 req/sec)
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (error) {
        console.error(`❌ Error processing ASIN ${item.asin}:`, error)
        errorCount++

        // Update attempts and mark as error if too many attempts
        const newAttempts = item.attempts + 1
        const status = newAttempts >= 3 ? 'error' : 'pending'
        const lastError = error instanceof Error ? error.message : 'Unknown error'

        await supabase
          .from('asin_enrichment_queue')
          .update({
            status,
            attempts: newAttempts,
            last_error: lastError,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        // On rate limit errors, wait longer
        if (error instanceof Error && error.message.includes('429')) {
          console.log('⏳ Rate limit hit, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
        }
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  console.log(`🎉 Title enrichment completed: ${processedCount} processed, ${errorCount} errors`)
}

function estimateMonthlySalesFromRank(salesRank: number): number {
  if (salesRank <= 0) return 0
  
  // Rough estimation formula for UK marketplace
  if (salesRank <= 100) return Math.floor(1000 - (salesRank * 8))
  if (salesRank <= 1000) return Math.floor(500 - (salesRank * 0.4))
  if (salesRank <= 10000) return Math.floor(200 - (salesRank * 0.015))
  if (salesRank <= 100000) return Math.floor(50 - (salesRank * 0.0003))
  if (salesRank <= 1000000) return Math.floor(10 - (salesRank * 0.000005))
  
  return 1 // Very low sales for ranks above 1M
}