'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { useSyncStatus } from '@/contexts/SyncStatusContext'

interface StatusMessage {
  id: string
  type: 'info' | 'success' | 'error' | 'progress'
  message: string
  timestamp: Date
  autoHide?: boolean
}

export default function StatusBar() {
  const { syncOperations } = useSyncStatus()
  const [messages, setMessages] = useState<StatusMessage[]>([])
  const [isVisible, setIsVisible] = useState(false)

  // Convert sync operations to status messages
  useEffect(() => {
    const newMessages: StatusMessage[] = []
    console.log('StatusBar - Current sync operations:', syncOperations)
    
    Object.entries(syncOperations).forEach(([id, operation]) => {
      if (operation.status === 'active') {
        newMessages.push({
          id,
          type: 'progress',
          message: `${operation.storefront}: ${operation.message}`,
          timestamp: operation.startTime,
          autoHide: false
        })
      } else if (operation.status === 'completed' && Date.now() - operation.endTime!.getTime() < 10000) {
        newMessages.push({
          id,
          type: 'success',
          message: `${operation.storefront}: ${operation.message}`,
          timestamp: operation.endTime!,
          autoHide: true
        })
      } else if (operation.status === 'error' && Date.now() - operation.endTime!.getTime() < 30000) {
        newMessages.push({
          id,
          type: 'error',
          message: `${operation.storefront}: ${operation.message}`,
          timestamp: operation.endTime!,
          autoHide: true
        })
      }
    })
    
    setMessages(newMessages)
    setIsVisible(newMessages.length > 0)
  }, [syncOperations])

  // Auto-hide messages
  useEffect(() => {
    const timer = setInterval(() => {
      setMessages(prev => prev.filter(msg => {
        if (!msg.autoHide) return true
        const age = Date.now() - msg.timestamp.getTime()
        return age < (msg.type === 'error' ? 30000 : 10000)
      }))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  if (!isVisible || messages.length === 0) return null

  const getIcon = (type: StatusMessage['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />
      case 'error':
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
      case 'progress':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return <InformationCircleIcon className="w-5 h-5 text-gray-500" />
    }
  }

  const getBgColor = (type: StatusMessage['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'progress':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 space-y-2">
      <div className="max-w-7xl mx-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-center gap-3 p-3 rounded-xl border shadow-lg backdrop-blur-sm ${getBgColor(message.type)} transition-all animate-slide-up`}
          >
            {getIcon(message.type)}
            <span className="flex-1 text-sm font-medium text-gray-700">
              {message.message}
            </span>
            {message.autoHide && (
              <button
                onClick={() => setMessages(prev => prev.filter(m => m.id !== message.id))}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}