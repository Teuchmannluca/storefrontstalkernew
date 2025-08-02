import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Create browser client for client-side operations
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Legacy export for backward compatibility
export const createClient = () => supabase