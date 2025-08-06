import { NextRequest, NextResponse } from 'next/server'
import { validateApiRequest } from '@/lib/auth'
import { UnifiedSPAPIRateLimiter } from '@/lib/unified-sp-api-rate-limiter'

/**
 * Get current rate limit status for all SP-API operations
 * 
 * Returns token counts, queue depths, and estimated wait times
 */
export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    await validateApiRequest(request)
    
    // Get rate limiter instance
    const rateLimiter = UnifiedSPAPIRateLimiter.getInstance()
    
    // Get current status
    const status = rateLimiter.getStatus()
    
    // Add human-readable information
    const enhancedStatus = Object.entries(status).map(([operation, data]) => {
      const nextAvailableDate = new Date(data.nextAvailable)
      const waitTime = Math.max(0, data.nextAvailable - Date.now())
      
      return {
        operation,
        tokensAvailable: data.tokensAvailable,
        queueLength: data.queueLength,
        nextAvailableTime: nextAvailableDate.toISOString(),
        estimatedWaitMs: waitTime,
        estimatedWaitSeconds: Math.ceil(waitTime / 1000),
        lastRequestTime: data.lastRequest > 0 ? new Date(data.lastRequest).toISOString() : null,
        status: data.tokensAvailable > 0 ? 'ready' : data.queueLength > 0 ? 'queued' : 'waiting'
      }
    })
    
    // Calculate overall system status
    const totalQueued = enhancedStatus.reduce((sum, op) => sum + op.queueLength, 0)
    const readyOperations = enhancedStatus.filter(op => op.status === 'ready').length
    const maxWaitTime = Math.max(...enhancedStatus.map(op => op.estimatedWaitMs))
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      systemStatus: {
        totalQueuedRequests: totalQueued,
        readyOperations,
        totalOperations: enhancedStatus.length,
        maxWaitTimeMs: maxWaitTime,
        maxWaitTimeSeconds: Math.ceil(maxWaitTime / 1000),
        overallStatus: totalQueued === 0 ? 'healthy' : totalQueued < 10 ? 'busy' : 'overloaded'
      },
      operations: enhancedStatus
    })
    
  } catch (error: any) {
    console.error('Rate limit status error:', error)
    return NextResponse.json(
      { error: 'Failed to get rate limit status', message: error.message }, 
      { status: 500 }
    )
  }
}

/**
 * Reset rate limiter (for testing only)
 */
export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    await validateApiRequest(request)
    
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Rate limiter reset not allowed in production' },
        { status: 403 }
      )
    }
    
    // Get rate limiter instance and reset
    const rateLimiter = UnifiedSPAPIRateLimiter.getInstance()
    rateLimiter.reset()
    
    return NextResponse.json({
      success: true,
      message: 'Rate limiter reset successfully',
      timestamp: new Date().toISOString()
    })
    
  } catch (error: any) {
    console.error('Rate limiter reset error:', error)
    return NextResponse.json(
      { error: 'Failed to reset rate limiter', message: error.message },
      { status: 500 }
    )
  }
}