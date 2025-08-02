'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

export interface SyncOperation {
  id: string
  type: 'storefront_sync' | 'bulk_update' | 'arbitrage_scan'
  storefront: string
  status: 'active' | 'completed' | 'error'
  message: string
  progress?: {
    current: number
    total: number
  }
  startTime: Date
  endTime?: Date
}

interface SyncStatusContextType {
  syncOperations: Record<string, SyncOperation>
  addSyncOperation: (operation: Omit<SyncOperation, 'startTime'>) => void
  updateSyncOperation: (id: string, updates: Partial<SyncOperation>) => void
  removeSyncOperation: (id: string) => void
  clearCompletedOperations: () => void
}

const SyncStatusContext = createContext<SyncStatusContextType | undefined>(undefined)

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [syncOperations, setSyncOperations] = useState<Record<string, SyncOperation>>({})

  const addSyncOperation = useCallback((operation: Omit<SyncOperation, 'startTime'>) => {
    setSyncOperations(prev => ({
      ...prev,
      [operation.id]: {
        ...operation,
        startTime: new Date()
      }
    }))
  }, [])

  const updateSyncOperation = useCallback((id: string, updates: Partial<SyncOperation>) => {
    setSyncOperations(prev => {
      if (!prev[id]) return prev
      
      return {
        ...prev,
        [id]: {
          ...prev[id],
          ...updates,
          endTime: updates.status === 'completed' || updates.status === 'error' ? new Date() : prev[id].endTime
        }
      }
    })
  }, [])

  const removeSyncOperation = useCallback((id: string) => {
    setSyncOperations(prev => {
      const { [id]: _, ...rest } = prev
      return rest
    })
  }, [])

  const clearCompletedOperations = useCallback(() => {
    setSyncOperations(prev => {
      const active = Object.entries(prev).reduce((acc, [id, op]) => {
        if (op.status === 'active') {
          acc[id] = op
        }
        return acc
      }, {} as Record<string, SyncOperation>)
      return active
    })
  }, [])

  return (
    <SyncStatusContext.Provider value={{
      syncOperations,
      addSyncOperation,
      updateSyncOperation,
      removeSyncOperation,
      clearCompletedOperations
    }}>
      {children}
    </SyncStatusContext.Provider>
  )
}

export function useSyncStatus() {
  const context = useContext(SyncStatusContext)
  if (!context) {
    throw new Error('useSyncStatus must be used within a SyncStatusProvider')
  }
  return context
}