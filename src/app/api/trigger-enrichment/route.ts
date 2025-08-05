import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  console.log('🔍 Manual enrichment trigger called')
  
  try {
    const { user } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    console.log('👤 User triggering enrichment:', user.id)

    // Trigger enrichment endpoint
    try {
      const enrichmentResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/enrich-titles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      })
      
      if (enrichmentResponse.ok) {
        const result = await enrichmentResponse.json()
        console.log(`✅ Background title enrichment triggered successfully`)
        return NextResponse.json({ 
          message: 'Title enrichment started successfully',
          result 
        })
      } else {
        const errorText = await enrichmentResponse.text()
        console.log(`⚠️ Failed to start background enrichment: ${enrichmentResponse.status} - ${errorText}`)
        return NextResponse.json({ 
          error: `Failed to start enrichment: ${enrichmentResponse.status}`,
          details: errorText
        }, { status: enrichmentResponse.status })
      }
    } catch (error) {
      console.error(`❌ Error triggering enrichment:`, error)
      return serverErrorResponse('Failed to trigger enrichment')
    }

  } catch (error) {
    console.error('Error in manual enrichment trigger:', error)
    return serverErrorResponse('Failed to trigger enrichment')
  }
}