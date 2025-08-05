import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { KeepaUpdateManager } from '@/lib/keepa-update-manager'
import { KeepaBatchUpdateManager } from '@/lib/keepa-batch-update-manager'
import { updateBatchProgress, completeBatchProgress } from '@/lib/batch-progress-tracker'

// Global processing state to prevent multiple concurrent updates
let isProcessing = false

export async function POST(request: NextRequest) {
  console.log('🚀 Fast Batch Update All endpoint called')
  try {
    // Parse request body for options
    const body = await request.json().catch(() => ({}))
    const { fetchTitles = false } = body
    
    // Verify authentication
    const { user, supabase } = await requireAuth()
    console.log('👤 User authenticated:', user?.id)
    
    if (!user) {
      console.log('❌ No user found')
      return unauthorizedResponse()
    }

    // Prevent multiple concurrent update processes
    if (isProcessing) {
      console.log('⚠️ Update already in progress')
      return NextResponse.json({ 
        message: 'Update process is already running. Please wait for it to complete.',
        error: 'Update already in progress'
      }, { status: 409 })
    }

    // Get all storefronts for the user
    const { data: storefronts, error: fetchError } = await supabase
      .from('storefronts')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('❌ Error fetching storefronts:', fetchError)
      throw fetchError
    }

    console.log(`📊 Found ${storefronts?.length || 0} storefronts`)

    if (!storefronts || storefronts.length === 0) {
      console.log('ℹ️ No storefronts to update')
      return NextResponse.json({ 
        message: 'No storefronts found to update' 
      }, { status: 200 })
    }

    // Initialize batch update manager
    console.log('🔧 Initializing KeepaBatchUpdateManager...')
    let batchManager: KeepaBatchUpdateManager
    try {
      batchManager = new KeepaBatchUpdateManager(user.id)
      console.log('✅ KeepaBatchUpdateManager initialized')
    } catch (error) {
      console.error('❌ Error initializing KeepaBatchUpdateManager:', error)
      throw error
    }

    // Check token availability
    console.log('🪙 Checking token availability...')
    const tokenStatus = await batchManager.getTokenStatus()
    console.log('Token status:', tokenStatus)
    
    // Check if we have enough tokens to start (at least 1 storefront)
    if (tokenStatus.availableTokens < 50) {
      const tokensShort = 50 - tokenStatus.availableTokens
      const waitMinutes = Math.ceil(tokensShort / 22) // 22 tokens per minute
      
      console.log(`❌ Not enough tokens to start: have ${tokenStatus.availableTokens}, need 50`)
      return NextResponse.json({
        message: `Insufficient Keepa tokens to start update. Need at least 50 tokens, have ${tokenStatus.availableTokens}. Wait ${waitMinutes} minutes for more tokens.`,
        error: 'Insufficient tokens',
        tokensNeeded: 50,
        tokensAvailable: tokenStatus.availableTokens,
        estimatedWaitMinutes: waitMinutes
      }, { status: 429 })
    }

    const storefrontIds = storefronts.map(s => s.id)
    
    // Start fast batch processing in background
    setImmediate(async () => {
      isProcessing = true
      try {
        console.log(`🚀 Starting fast batch processing for up to ${tokenStatus.maxStorefrontsNow} storefronts`)
        
        // Initialize progress tracking
        const totalBatches = Math.ceil(storefronts.length / tokenStatus.maxStorefrontsNow)
        updateBatchProgress(user.id, {
          isProcessing: true,
          totalStorefronts: storefronts.length,
          processedStorefronts: 0,
          currentBatch: 0,
          totalBatches,
          currentStorefronts: [],
          completedStorefronts: [],
          tokensUsed: 0,
          tokensAvailable: tokenStatus.availableTokens,
          startTime: new Date()
        })
        
        let remainingStorefronts = [...storefrontIds]
        let totalResults: any[] = []
        let batchCount = 1
        
        // Process in batches as tokens become available
        while (remainingStorefronts.length > 0) {
          const currentTokenStatus = await batchManager.getTokenStatus()
          
          if (currentTokenStatus.maxStorefrontsNow === 0) {
            console.log(`⏳ Waiting ${currentTokenStatus.timeToNext50Tokens} minutes for more tokens...`)
            await new Promise(resolve => setTimeout(resolve, currentTokenStatus.timeToNext50Tokens * 60 * 1000))
            continue
          }
          
          const batchSize = Math.min(currentTokenStatus.maxStorefrontsNow, remainingStorefronts.length)
          const currentBatch = remainingStorefronts.slice(0, batchSize)
          remainingStorefronts = remainingStorefronts.slice(batchSize)
          
          // Update progress - starting batch
          const currentStorefrontNames = storefronts
            .filter(s => currentBatch.includes(s.id))
            .map(s => s.name)
          
          updateBatchProgress(user.id, {
            currentBatch: batchCount,
            currentStorefronts: currentStorefrontNames,
            tokensAvailable: currentTokenStatus.availableTokens
          })
          
          console.log(`🔥 Processing batch ${batchCount}: ${batchSize} storefronts in parallel`)
          
          const batchResults = await batchManager.processBatchUpdate(currentBatch, { 
            fetchTitlesImmediately: fetchTitles 
          })
          totalResults.push(...batchResults)
          
          // Update progress - batch completed
          const completedStorefronts = batchResults.map(result => ({
            id: result.storefrontId,
            name: result.storefrontName,
            productsAdded: result.productsAdded,
            productsRemoved: result.productsRemoved,
            success: result.success,
            error: result.error
          }))
          
          // Get updated token status from the batch manager
          const updatedTokenStatus = await batchManager.getTokenStatus()
          
          updateBatchProgress(user.id, {
            processedStorefronts: totalResults.length,
            tokensUsed: totalResults.reduce((sum, r) => sum + r.tokensUsed, 0),
            tokensAvailable: updatedTokenStatus.availableTokens,
            currentStorefronts: [],
            completedStorefronts: totalResults.map(result => ({
              id: result.storefrontId,
              name: result.storefrontName,
              productsAdded: result.productsAdded,
              productsRemoved: result.productsRemoved,
              success: result.success,
              error: result.error
            }))
          })
          
          const successful = batchResults.filter(r => r.success).length
          const failed = batchResults.filter(r => !r.success).length
          const productsAdded = batchResults.reduce((sum, r) => sum + r.productsAdded, 0)
          const productsRemoved = batchResults.reduce((sum, r) => sum + r.productsRemoved, 0)
          
          console.log(`✅ Batch ${batchCount} completed: ${successful} successful, ${failed} failed`)
          console.log(`📊 Batch ${batchCount}: +${productsAdded} products, -${productsRemoved} products`)
          
          batchCount++
          
          // Small delay between batches
          if (remainingStorefronts.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
        
        const totalSuccessful = totalResults.filter(r => r.success).length
        const totalFailed = totalResults.filter(r => !r.success).length
        const totalProductsAdded = totalResults.reduce((sum, r) => sum + r.productsAdded, 0)
        const totalProductsRemoved = totalResults.reduce((sum, r) => sum + r.productsRemoved, 0)
        const totalTokensUsed = totalResults.reduce((sum, r) => sum + r.tokensUsed, 0)
        
        console.log(`🎉 All batches completed!`)
        console.log(`📈 Total: ${totalSuccessful} successful, ${totalFailed} failed`)
        console.log(`📊 Total: +${totalProductsAdded} products, -${totalProductsRemoved} products`)
        console.log(`🪙 Total tokens used: ${totalTokensUsed}`)
        
        // Complete batch progress
        completeBatchProgress(user.id)
        
        // Auto-trigger background title enrichment if products were added and not fetched immediately
        if (totalProductsAdded > 0 && !fetchTitles) {
          console.log(`🔍 Auto-triggering background title enrichment for ${totalProductsAdded} new products`)
          
          // Trigger enrichment in separate async process to avoid blocking
          setImmediate(async () => {
            try {
              const enrichmentResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/enrich-titles`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                }
              })
              
              if (enrichmentResponse.ok) {
                console.log(`✅ Background title enrichment started automatically`)
              } else {
                const errorText = await enrichmentResponse.text()
                console.log(`⚠️ Failed to start background enrichment: ${enrichmentResponse.status} - ${errorText}`)
              }
            } catch (error) {
              console.error(`❌ Error triggering enrichment:`, error)
            }
          })
        }
        
      } catch (error) {
        console.error('❌ Error in fast batch update process:', error)
      } finally {
        isProcessing = false
      }
    })
    
    return NextResponse.json({ 
      message: `Fast batch update started! Processing up to ${tokenStatus.maxStorefrontsNow} storefronts in parallel.`,
      totalStorefronts: storefronts.length,
      maxParallelStorefronts: tokenStatus.maxStorefrontsNow,
      tokensAvailable: tokenStatus.availableTokens,
      fetchTitles: fetchTitles,
      estimatedBatchTime: fetchTitles ? '30-60 seconds per batch' : '5-10 seconds per batch',
      storefronts: storefronts.map(s => ({ id: s.id, name: s.name }))
    }, { status: 200 })

  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return unauthorizedResponse()
    }
    console.error('Error starting update process:', error)
    return serverErrorResponse('Failed to start update process')
  }
}

// Add GET endpoint to check batch status
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    const batchManager = new KeepaBatchUpdateManager(user.id)
    const tokenStatus = await batchManager.getTokenStatus()
    const enrichmentStatus = await batchManager.getEnrichmentQueueStatus()

    return NextResponse.json({
      isProcessing,
      tokens: tokenStatus,
      enrichmentQueue: enrichmentStatus
    })

  } catch (error) {
    console.error('Error getting batch status:', error)
    return serverErrorResponse('Failed to get batch status')
  }
}