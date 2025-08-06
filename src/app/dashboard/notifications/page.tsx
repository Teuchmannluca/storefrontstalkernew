'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { 
  BellIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  BoltIcon,
  ClockIcon
} from '@heroicons/react/24/outline'

interface TelegramConnection {
  chat_id: string;
  bot_token?: string;
  username?: string;
  first_name?: string;
  enabled: boolean;
}

interface NotificationPreference {
  notification_type: string;
  enabled: boolean;
  priority: 'immediate' | 'normal' | 'low';
}

interface NotificationHistory {
  id: string;
  notification_type: string;
  message: string;
  status: string;
  sent_at: string;
  metadata: any;
}

const notificationCategories = {
  storefront: {
    title: 'Storefront Updates',
    icon: '🏪',
    notifications: [
      { type: 'storefront_added', label: 'New Storefront Added', description: 'When you add a new storefront' },
      { type: 'products_sync_complete', label: 'Products Sync Complete', description: 'When product sync finishes' },
      { type: 'new_products_found', label: 'New Products Found', description: 'When new ASINs are discovered' },
    ]
  },
  arbitrage: {
    title: 'Arbitrage Alerts',
    icon: '💰',
    notifications: [
      { type: 'high_profit_deal', label: 'High-Profit Deals', description: 'Profit > £10 or ROI > 50%' },
      { type: 'scan_complete', label: 'Scan Complete', description: 'When arbitrage scan finishes' },
      { type: 'price_change_alert', label: 'Price Changes', description: 'Significant price changes (>10%)' },
    ]
  },
  system: {
    title: 'System Events',
    icon: '⚙️',
    notifications: [
      { type: 'scheduled_task_complete', label: 'Scheduled Tasks', description: 'When cron jobs complete' },
      { type: 'api_quota_warning', label: 'API Quota Warnings', description: 'When API usage > 80%' },
      { type: 'keepa_token_low', label: 'Keepa Token Status', description: 'When tokens < 100' },
    ]
  }
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connection, setConnection] = useState<TelegramConnection | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [history, setHistory] = useState<NotificationHistory[]>([])
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [setupStep, setSetupStep] = useState(1)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle')
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
    } else {
      await loadData()
      setLoading(false)
    }
  }

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Load telegram connection
      const { data: connectionData } = await supabase
        .from('telegram_connections')
        .select('*')
        .single()

      if (connectionData) {
        setConnection(connectionData)
        setBotToken(connectionData.bot_token || '')
        setChatId(connectionData.chat_id || '')
      } else {
        setShowSetup(true)
      }

      // Load preferences
      const { data: prefsData } = await supabase
        .from('notification_preferences')
        .select('*')

      if (prefsData) {
        setPreferences(prefsData)
      }

      // Load recent history
      const { data: historyData } = await supabase
        .from('notification_history')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(10)

      if (historyData) {
        setHistory(historyData)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const verifyBotToken = async () => {
    setVerificationStatus('verifying')
    try {
      const response = await fetch('/api/telegram/verify-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken })
      })

      const data = await response.json()
      if (data.success) {
        setVerificationStatus('success')
        setSetupStep(2)
      } else {
        setVerificationStatus('error')
      }
    } catch (error) {
      setVerificationStatus('error')
    }
  }

  const findChatId = async () => {
    try {
      const response = await fetch('/api/telegram/get-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken })
      })

      const data = await response.json()
      if (data.chatId) {
        setChatId(data.chatId)
        setSetupStep(3)
      } else {
        alert('No messages found. Please send a message to your bot first.')
      }
    } catch (error) {
      alert('Failed to find chat ID')
    }
  }

  const saveConnection = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const connectionData = {
        user_id: user.id,
        chat_id: chatId,
        bot_token: botToken || null,
        enabled: true
      }

      if (connection) {
        // Update existing
        await supabase
          .from('telegram_connections')
          .update(connectionData)
          .eq('user_id', user.id)
      } else {
        // Insert new
        await supabase
          .from('telegram_connections')
          .insert(connectionData)
      }

      setShowSetup(false)
      await loadData()
    } catch (error) {
      console.error('Error saving connection:', error)
      alert('Failed to save connection')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      if (data.success) {
        alert('Test notification sent successfully! Check your Telegram.')
      } else {
        alert(`Failed to send test notification: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to send test notification')
    } finally {
      setTesting(false)
    }
  }

  const togglePreference = async (type: string) => {
    const pref = preferences.find(p => p.notification_type === type)
    const newValue = !pref?.enabled

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          notification_type: type,
          enabled: newValue,
          priority: pref?.priority || 'normal'
        })

      setPreferences(prev => {
        const existing = prev.find(p => p.notification_type === type)
        if (existing) {
          return prev.map(p => 
            p.notification_type === type 
              ? { ...p, enabled: newValue }
              : p
          )
        } else {
          return [...prev, {
            notification_type: type,
            enabled: newValue,
            priority: 'normal'
          }]
        }
      })
    } catch (error) {
      console.error('Error updating preference:', error)
    }
  }

  const updatePriority = async (type: string, priority: 'immediate' | 'normal' | 'low') => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('notification_preferences')
        .update({ priority })
        .eq('user_id', user.id)
        .eq('notification_type', type)

      setPreferences(prev => prev.map(p => 
        p.notification_type === type 
          ? { ...p, priority }
          : p
      ))
    } catch (error) {
      console.error('Error updating priority:', error)
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'immediate': return <BoltIcon className="w-4 h-4 text-red-500" />
      case 'normal': return <BellIcon className="w-4 h-4 text-blue-500" />
      case 'low': return <ClockIcon className="w-4 h-4 text-gray-500" />
      default: return <BellIcon className="w-4 h-4 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar onSignOut={handleSignOut} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar onSignOut={handleSignOut} />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Notifications</h1>
            <p className="text-gray-600">Configure Telegram notifications for important events</p>
          </div>

          {/* Connection Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                Telegram Connection
              </h2>
              {connection && (
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {testing ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="w-4 h-4" />
                  )}
                  Test Connection
                </button>
              )}
            </div>

            {connection ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Status:</span>
                  {connection.enabled ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircleIcon className="w-4 h-4" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircleIcon className="w-4 h-4" />
                      Disabled
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Chat ID:</span>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">{connection.chat_id}</code>
                </div>
                {connection.username && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Username:</span>
                    <span className="text-sm">@{connection.username}</span>
                  </div>
                )}
                <button
                  onClick={() => setShowSetup(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Update Connection Settings
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSetup(true)}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Setup Telegram Connection
              </button>
            )}
          </div>

          {/* Setup Modal */}
          {showSetup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Setup Telegram Bot</h2>
                
                {setupStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bot Token (Optional)
                      </label>
                      <input
                        type="text"
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        placeholder="Use default bot or enter your own"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to use the default Storefront Stalker bot
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSetupStep(2)}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        {botToken ? 'Verify Bot' : 'Use Default Bot'}
                      </button>
                      <button
                        onClick={() => setShowSetup(false)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p className="font-medium mb-1">How to create a bot:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Open Telegram and search for @BotFather</li>
                        <li>Send /newbot and follow instructions</li>
                        <li>Copy the bot token provided</li>
                      </ol>
                    </div>
                  </div>
                )}

                {setupStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chat ID
                      </label>
                      <input
                        type="text"
                        value={chatId}
                        onChange={(e) => setChatId(e.target.value)}
                        placeholder="Enter your chat ID"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <button
                      onClick={findChatId}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Find My Chat ID Automatically
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSetupStep(3)}
                        disabled={!chatId}
                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setSetupStep(1)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Back
                      </button>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p className="font-medium mb-1">To find your chat ID:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Send a message to your bot on Telegram</li>
                        <li>Click &quot;Find My Chat ID Automatically&quot;</li>
                        <li>Or use @userinfobot to get your ID</li>
                      </ol>
                    </div>
                  </div>
                )}

                {setupStep === 3 && (
                  <div className="space-y-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <CheckCircleIcon className="w-8 h-8 text-green-600 mx-auto mb-2" />
                      <p className="text-center text-green-800 font-medium">Ready to Connect!</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Bot Token:</span>
                        <span className="font-mono text-xs">{botToken ? '••••••••' : 'Default Bot'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Chat ID:</span>
                        <span className="font-mono">{chatId}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={saveConnection}
                        disabled={saving}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Connection'}
                      </button>
                      <button
                        onClick={() => setSetupStep(2)}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notification Preferences */}
          {connection && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
              
              <div className="space-y-6">
                {Object.entries(notificationCategories).map(([key, category]) => (
                  <div key={key}>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <span className="text-xl">{category.icon}</span>
                      {category.title}
                    </h3>
                    
                    <div className="space-y-2">
                      {category.notifications.map(notif => {
                        const pref = preferences.find(p => p.notification_type === notif.type)
                        const isEnabled = pref?.enabled ?? false
                        const priority = pref?.priority || 'normal'
                        
                        return (
                          <div key={notif.type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => togglePreference(notif.type)}
                                className="w-5 h-5 text-indigo-600 rounded"
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{notif.label}</p>
                                <p className="text-xs text-gray-500">{notif.description}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {getPriorityIcon(priority)}
                              <select
                                value={priority}
                                onChange={(e) => updatePriority(notif.type, e.target.value as any)}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                                disabled={!isEnabled}
                              >
                                <option value="immediate">Immediate</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                              </select>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notification History */}
          {history.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Notifications</h2>
              
              <div className="space-y-2">
                {history.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {item.status === 'sent' ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.notification_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(item.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      item.status === 'sent' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}