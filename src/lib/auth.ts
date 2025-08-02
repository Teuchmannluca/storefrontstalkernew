import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  id: string
  email?: string
  role?: string
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Validates JWT token format and structure
 */
export function validateJWTFormat(token: string): boolean {
  try {
    // Basic JWT structure validation (header.payload.signature)
    const parts = token.split('.')
    if (parts.length !== 3) return false

    // Decode and validate header
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || !decoded.header || !decoded.payload) {
      return false
    }

    // Check expiry if present
    const payload = decoded.payload as any
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return false
    }

    // Check for required fields
    if (!payload.sub) return false // Subject (user ID)

    return true
  } catch {
    return false
  }
}

/**
 * Validates API request and returns authenticated user
 */
export async function validateApiRequest(request: NextRequest): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid authorization header')
  }

  const token = authHeader.substring(7)
  
  if (!validateJWTFormat(token)) {
    throw new AuthError('Invalid token format')
  }

  // Create Supabase client with service role key for user validation
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    throw new AuthError('Invalid or expired token')
  }

  return {
    id: user.id,
    email: user.email,
    role: user.user_metadata?.role
  }
}

/**
 * Creates a standardized error response
 */
export function createAuthErrorResponse(error: AuthError | Error) {
  const statusCode = error instanceof AuthError ? error.statusCode : 401
  const message = error.message || 'Authentication failed'
  
  return Response.json(
    { error: message },
    { status: statusCode }
  )
}

/**
 * Rate limiting helper - checks if user has exceeded rate limits
 */
export function checkRateLimit(userId: string, endpoint: string): boolean {
  // TODO: Implement proper distributed rate limiting with Redis
  // For now, return true (allow all requests)
  // This should be implemented with @upstash/ratelimit or similar
  return true
}