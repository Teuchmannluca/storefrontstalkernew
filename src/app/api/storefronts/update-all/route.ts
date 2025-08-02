import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
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
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
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
    console.error('Error starting update process:', error)
    return NextResponse.json({ 
      error: 'Failed to start update process' 
    }, { status: 500 })
  }
}