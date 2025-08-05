import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'
import { createClient } from '@supabase/supabase-js'
import { getBatchProgress, clearBatchProgress } from '@/lib/batch-progress-tracker'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Get batch progress
    const batchProgress = getBatchProgress(user.id)
    
    // Get enrichment queue status
    const { data: enrichmentStats } = await supabase
      .from('asin_enrichment_queue')
      .select('status')
      .eq('user_id', user.id)

    const enrichmentQueue = {
      pending: 0,
      processing: 0,
      completed: 0,
      error: 0,
      total: 0
    }

    if (enrichmentStats) {
      enrichmentQueue.total = enrichmentStats.length
      enrichmentStats.forEach(item => {
        enrichmentQueue[item.status as keyof typeof enrichmentQueue]++
      })
    }

    return NextResponse.json({
      batch: batchProgress || null,
      enrichment: enrichmentQueue
    })

  } catch (error) {
    console.error('Error getting batch status:', error)
    return serverErrorResponse('Failed to get batch status')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Clear batch progress for this user
    clearBatchProgress(user.id)
    
    return NextResponse.json({ message: 'Batch progress cleared' })

  } catch (error) {
    console.error('Error clearing batch status:', error)
    return serverErrorResponse('Failed to clear batch status')
  }
}