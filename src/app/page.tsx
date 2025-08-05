'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  // Check if user is already authenticated on page load
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        window.location.href = '/dashboard'
      }
    }
    checkAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.href = '/dashboard'
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Show progress to user
    setError('🔄 Attempting to sign in...')

    if (!email || !password) {
      setError('Please enter both email and password')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        throw error
      }
      
      if (data.user && data.session) {
        setError('✅ Login successful! Redirecting...')
        
        // Wait a moment for session to be stored
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 500)
      } else {
        throw new Error('No user data returned')
      }
      
    } catch (error: any) {
      setError(`❌ Login failed: ${error.message}`)
      setLoading(false)
    }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-to-br from-violet-200/20 to-indigo-200/20 rounded-full blur-2xl"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-2xl"></div>
      </div>

      {/* Main content */}
      <div className="relative w-full max-w-md">
        <div className="bg-white/90 rounded-2xl shadow-xl p-8 border border-white/30">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3">
              <div className="w-14 h-14 bg-gradient-to-br from-violet-400 to-indigo-400 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-gray-800">Storefront Stalker</span>
            </div>
          </div>

          {/* Slogan - Enhanced */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
              teamwork make the dream work
            </h1>
            <p className="text-gray-600">
              Sign in to continue
            </p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-800"
                placeholder="you@example.com"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-gray-800 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className={`p-3 rounded-xl text-sm border ${
                error.includes('✅') ? 'bg-green-50 text-green-600 border-green-100' :
                error.includes('🔄') ? 'bg-blue-50 text-blue-600 border-blue-100' :
                'bg-red-50 text-red-600 border-red-100'
              }`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white py-3 rounded-xl font-semibold hover:from-violet-600 hover:to-indigo-600 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Processing...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}