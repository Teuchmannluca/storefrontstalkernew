import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // Security headers for all responses
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  
  // Create Supabase client for SSR
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser()
  
  // Allow login page without authentication
  if (request.nextUrl.pathname === '/') {
    // If user is already authenticated, redirect to dashboard
    if (user && !error) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    // Otherwise allow access to login page
    return response
  }

  // Protect API routes (except public ones)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Allow health check and public endpoints
    const publicEndpoints = ['/api/health', '/api/status']
    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      request.nextUrl.pathname.startsWith(endpoint)
    )
    
    if (!isPublicEndpoint && (!user || error)) {
      return NextResponse.json(
        { error: 'Authentication required' }, 
        { status: 401 }
      )
    }
  }
  
  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user || error) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }
  
  // Block access to debug and test routes in production
  if (request.nextUrl.pathname.startsWith('/debug') || request.nextUrl.pathname.startsWith('/test')) {
    if (!user || error) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Rate limiting check (basic implementation)
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
  const rateLimitResponse = await checkRateLimit(ip, request.nextUrl.pathname)
  if (!rateLimitResponse.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { 
        status: 429,
        headers: {
          'Retry-After': rateLimitResponse.retryAfter.toString()
        }
      }
    )
  }

  return response
}

// Simple in-memory rate limiting (should be replaced with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

async function checkRateLimit(ip: string, path: string): Promise<{
  allowed: boolean
  retryAfter: number
}> {
  const key = `${ip}:${path}`
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  const maxRequests = path.startsWith('/api/') ? 60 : 100 // Different limits for API vs pages
  
  const current = rateLimitStore.get(key)
  
  if (!current || now > current.resetTime) {
    // New window or expired window
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  
  if (current.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((current.resetTime - now) / 1000)
    return { allowed: false, retryAfter }
  }
  
  // Increment counter
  current.count++
  rateLimitStore.set(key, current)
  
  return { allowed: true, retryAfter: 0 }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}