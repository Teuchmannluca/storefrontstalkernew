'use client'

import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { 
  XMarkIcon, 
  EyeIcon, 
  EyeSlashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon 
} from '@heroicons/react/24/outline'

interface SellerAmpModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (credentials: { username: string; password: string; rememberForSession: boolean }) => Promise<void>
  asin: string
  costPrice: number
  salePrice: number
  isLoading?: boolean
  isBatchMode?: boolean
}

export default function SellerAmpModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  asin,
  costPrice,
  salePrice,
  isLoading = false,
  isBatchMode = false
}: SellerAmpModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberForSession, setRememberForSession] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved credentials from localStorage on mount
  useState(() => {
    if (typeof window !== 'undefined') {
      const savedCredentials = localStorage.getItem('selleramp_session_credentials')
      if (savedCredentials) {
        try {
          const parsed = JSON.parse(savedCredentials)
          setUsername(parsed.username || '')
          setPassword(parsed.password || '')
          setRememberForSession(true)
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username || !password) {
      setError('Please enter both username and password')
      return
    }

    if (!/\S+@\S+\.\S+/.test(username)) {
      setError('Please enter a valid email address')
      return
    }

    try {
      // Save credentials to localStorage if requested
      if (rememberForSession) {
        localStorage.setItem('selleramp_session_credentials', JSON.stringify({
          username,
          password
        }))
      } else {
        localStorage.removeItem('selleramp_session_credentials')
      }

      await onSubmit({ username, password, rememberForSession })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch SPM data')
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setError(null)
      onClose()
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Fetch SPM from SellerAmp
                  </Dialog.Title>
                  {!isLoading && (
                    <button
                      onClick={handleClose}
                      className="text-gray-400 hover:text-gray-500 focus:outline-none"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  )}
                </div>

                {/* Product Info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    {isBatchMode ? 'Batch Processing:' : 'Product Details:'}
                  </h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    {isBatchMode ? (
                      <>
                        <p><span className="font-medium">Items to Process:</span> {asin}</p>
                        <p className="text-amber-600">
                          <span className="font-medium">⚠️ Batch Mode:</span> This will fetch SPM data for all products with N/A data
                        </p>
                      </>
                    ) : (
                      <>
                        <p><span className="font-medium">ASIN:</span> {asin}</p>
                        <p><span className="font-medium">Cost Price:</span> £{costPrice.toFixed(2)}</p>
                        <p><span className="font-medium">Sale Price:</span> £{salePrice.toFixed(2)}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Credentials Form */}
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4">
                    {/* Username */}
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                        SellerAmp Email
                      </label>
                      <input
                        type="email"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="your@email.com"
                        required
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        SellerAmp Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          placeholder="Enter your password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
                        >
                          {showPassword ? (
                            <EyeSlashIcon className="h-5 w-5" />
                          ) : (
                            <EyeIcon className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Remember Credentials */}
                    <div className="flex items-center">
                      <input
                        id="remember"
                        type="checkbox"
                        checked={rememberForSession}
                        onChange={(e) => setRememberForSession(e.target.checked)}
                        disabled={isLoading}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:cursor-not-allowed"
                      />
                      <label htmlFor="remember" className="ml-2 text-sm text-gray-700">
                        Remember for this session
                      </label>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    )}

                    {/* Info Message */}
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <CheckCircleIcon className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium mb-1">Secure & Private</p>
                        <p>Your credentials are only used for this request and are not stored on our servers. If you choose to remember them, they&apos;re saved locally in your browser only.</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={handleClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading || !username || !password}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoading ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                            Fetching SPM...
                          </>
                        ) : (
                          'Fetch SPM Data'
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}