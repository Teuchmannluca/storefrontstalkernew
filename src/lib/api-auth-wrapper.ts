import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from './auth-helpers'

/**
 * Wraps an API handler with authentication
 * Automatically handles auth errors and provides user context
 */
export function withAuth(
  handler: (request: NextRequest, context: { user: any, supabase: any }) => Promise<Response>
) {
  return async (request: NextRequest) => {
    try {
      const { user, supabase } = await requireAuth()
      return await handler(request, { user, supabase })
    } catch (error) {
      if (error instanceof Error && error.message === 'Authentication required') {
        return unauthorizedResponse()
      }
      console.error('API Error:', error)
      return serverErrorResponse()
    }
  }
}