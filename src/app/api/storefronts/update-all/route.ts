import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { KeepaUpdateManager } from '@/lib/keepa-update-manager'

// Global processing state to prevent multiple concurrent updates
let isProcessing = false

export async function POST(request: NextRequest) {
  console.log('🚀 Update All endpoint called')
  try {
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

    // Initialize update manager
    console.log('🔧 Initializing KeepaUpdateManager...')
    let updateManager: KeepaUpdateManager
    try {
      updateManager = new KeepaUpdateManager(user.id)
      console.log('✅ KeepaUpdateManager initialized')
    } catch (error) {
      console.error('❌ Error initializing KeepaUpdateManager:', error)
      throw error
    }

    // Check token availability
    console.log('🪙 Checking token availability...')
    const tokenStatus = await updateManager.getQueueStatus()
    console.log('Token status:', tokenStatus)
    const tokensNeeded = storefronts.length * 50 // 50 tokens per storefront
    console.log(`🪙 Need ${tokensNeeded} tokens, have ${tokenStatus.availableTokens}`)
    
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

    console.log(`✅ Queueing all ${storefronts.length} storefronts for gradual processing`)

    // Queue ALL storefronts - the system will process them as tokens become available
    const storefrontIds = storefronts.map(s => s.id)
    await updateManager.queueStorefrontUpdates(storefrontIds)
    
    // Start processing in background
    setImmediate(async () => {
      isProcessing = true
      try {
        console.log(`Starting gradual update process for ${storefronts.length} storefronts`)
        const results = await updateManager.processQueue()
        
        const successful = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length
        const totalProductsAdded = results.reduce((sum, r) => sum + r.productsAdded, 0)
        const totalProductsRemoved = results.reduce((sum, r) => sum + r.productsRemoved, 0)
        const totalTokensUsed = results.reduce((sum, r) => sum + r.tokensUsed, 0)
        
        console.log(`Update process completed: ${successful} successful, ${failed} failed`)
        console.log(`Products: +${totalProductsAdded}, -${totalProductsRemoved}, Tokens: ${totalTokensUsed}`)
        
        const processed = successful + failed
        if (processed < storefronts.length) {
          const remaining = storefronts.length - processed
          console.log(`ℹ️ ${remaining} storefronts remaining (will process as tokens become available)`)
        }
        
        // Clean up completed queue items after 1 hour
        setTimeout(async () => {
          await updateManager.clearCompletedUpdates()
        }, 60 * 60 * 1000)
        
      } catch (error) {
        console.error('Error in background update process:', error)
      } finally {
        isProcessing = false
      }
    })

    const estimatedMinutes = Math.ceil((tokensNeeded - tokenStatus.availableTokens) / 22)
    
    return NextResponse.json({ 
      message: `Update process started for all ${storefronts.length} storefronts. Processing gradually as tokens become available.`,
      queued: storefronts.length,
      totalStorefronts: storefronts.length,
      tokensRequired: tokensNeeded,
      tokensAvailable: tokenStatus.availableTokens,
      estimatedTokensPerMinute: 22,
      estimatedCompletionMinutes: estimatedMinutes,
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

// Add GET endpoint to check queue status
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    const updateManager = new KeepaUpdateManager(user.id)
    const status = await updateManager.getQueueStatus()

    return NextResponse.json({
      isProcessing,
      ...status
    })

  } catch (error) {
    console.error('Error getting queue status:', error)
    return serverErrorResponse('Failed to get queue status')
  }
}