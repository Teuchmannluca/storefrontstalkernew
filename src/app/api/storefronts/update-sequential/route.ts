import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { KeepaSequentialManager } from '@/lib/keepa-sequential-manager'

export async function POST(request: NextRequest) {
  console.log('🚀 Sequential Update endpoint called')
  try {
    // Parse request body for options
    const body = await request.json().catch(() => ({}))
    const { fetchTitles = false, storefrontIds } = body
    
    // Verify authentication
    const { user, supabase } = await requireAuth()
    console.log('👤 User authenticated:', user?.id)
    
    if (!user) {
      console.log('❌ No user found')
      return unauthorizedResponse()
    }

    // Get storefronts to process
    let storefrontsToProcess: string[] = []
    
    if (storefrontIds && Array.isArray(storefrontIds)) {
      // Use provided storefront IDs
      storefrontsToProcess = storefrontIds
    } else {
      // Get all storefronts for the user
      const { data: storefronts, error: fetchError } = await supabase
        .from('storefronts')
        .select('id')
        .eq('user_id', user.id)
        .order('name', { ascending: true })

      if (fetchError) {
        console.error('❌ Error fetching storefronts:', fetchError)
        throw fetchError
      }

      if (!storefronts || storefronts.length === 0) {
        console.log('ℹ️ No storefronts to update')
        return NextResponse.json({ 
          message: 'No storefronts found to update' 
        }, { status: 200 })
      }
      
      storefrontsToProcess = storefronts.map(s => s.id)
    }

    console.log(`📊 Found ${storefrontsToProcess.length} storefronts to process`)

    // Initialize sequential manager
    console.log('🔧 Initializing KeepaSequentialManager...')
    let sequentialManager: KeepaSequentialManager
    try {
      sequentialManager = new KeepaSequentialManager(user.id)
      console.log('✅ KeepaSequentialManager initialized')
    } catch (error) {
      console.error('❌ Error initializing KeepaSequentialManager:', error)
      throw error
    }

    // Start sequential processing
    const result = await sequentialManager.startSequentialUpdate(storefrontsToProcess, {
      fetchTitlesImmediately: fetchTitles
    })
    
    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return unauthorizedResponse()
    }
    console.error('Error starting sequential update:', error)
    return serverErrorResponse('Failed to start sequential update')
  }
}

// GET endpoint to check progress
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Get progress from static manager
    const progress = KeepaSequentialManager.getProgress(user.id)
    
    if (!progress) {
      return NextResponse.json({
        message: 'No sequential update in progress',
        isProcessing: false
      })
    }

    // Get current token status
    const sequentialManager = new KeepaSequentialManager(user.id)
    const tokenStatus = await sequentialManager.getTokenStatus()

    return NextResponse.json({
      ...progress,
      tokens: tokenStatus
    })

  } catch (error) {
    console.error('Error getting sequential update status:', error)
    return serverErrorResponse('Failed to get status')
  }
}

// DELETE endpoint to stop the sequential update
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    const sequentialManager = new KeepaSequentialManager(user.id)
    await sequentialManager.stopSequentialUpdate()

    return NextResponse.json({
      message: 'Sequential update stopped successfully'
    })

  } catch (error) {
    console.error('Error stopping sequential update:', error)
    return serverErrorResponse('Failed to stop update')
  }
}