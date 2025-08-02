import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { updateStorefront } from '../update/storefront-updater'

// Queue state
let updateQueue: string[] = []
let isProcessing = false

// Process queue with 3-minute delay between each storefront
async function processQueue() {
  if (isProcessing || updateQueue.length === 0) return
  
  isProcessing = true
  
  while (updateQueue.length > 0) {
    const storefrontId = updateQueue.shift()
    if (!storefrontId) continue
    
    try {
      console.log(`Processing storefront ${storefrontId}`)
      await updateStorefront(storefrontId)
      console.log(`Completed storefront ${storefrontId}`)
      
      // Wait 3 minutes before processing next storefront
      if (updateQueue.length > 0) {
        console.log(`Waiting 3 minutes before next storefront. ${updateQueue.length} remaining.`)
        await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000))
      }
    } catch (error) {
      console.error(`Error processing storefront ${storefrontId}:`, error)
    }
  }
  
  isProcessing = false
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user, supabase } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Get all storefronts for the user
    const { data: storefronts, error: fetchError } = await supabase
      .from('storefronts')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (fetchError) {
      throw fetchError
    }

    if (!storefronts || storefronts.length === 0) {
      return NextResponse.json({ 
        message: 'No storefronts found to update' 
      }, { status: 200 })
    }

    // Add storefronts to queue
    const newIds = storefronts.map(s => s.id)
    updateQueue.push(...newIds)
    
    // Start processing if not already running
    processQueue()

    return NextResponse.json({ 
      message: `Update process started for ${storefronts.length} storefronts. Estimated time: ${storefronts.length * 3} minutes.`,
      queued: storefronts.length,
      estimatedMinutes: storefronts.length * 3
    }, { status: 200 })

  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return unauthorizedResponse()
    }
    console.error('Error starting update process:', error)
    return serverErrorResponse('Failed to start update process')
  }
}