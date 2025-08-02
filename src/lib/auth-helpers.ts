import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for server-side operations with service role key
 * WARNING: This client bypasses RLS - use only for admin operations
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Creates a Supabase client for server-side operations with user context
 * This client respects RLS policies
 */
export async function createAuthenticatedClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}

/**
 * Authenticates the current request and returns the user
 * Throws an error if not authenticated
 */
export async function requireAuth() {
  const supabase = await createAuthenticatedClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Authentication required')
  }
  
  return { user, supabase }
}

/**
 * Standard error response for unauthorized access
 */
export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({ error: 'Authentication required' }),
    { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Standard error response for server errors
 */
export function serverErrorResponse(message: string = 'Internal server error') {
  return new Response(
    JSON.stringify({ error: message }),
    { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}