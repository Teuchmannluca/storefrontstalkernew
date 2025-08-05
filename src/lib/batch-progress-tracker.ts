// Global state for batch processing progress tracking
interface BatchProgress {
  isProcessing: boolean
  userId: string
  totalStorefronts: number
  processedStorefronts: number
  currentBatch: number
  totalBatches: number
  currentStorefronts: string[]
  completedStorefronts: {
    id: string
    name: string
    productsAdded: number
    productsRemoved: number
    success: boolean
    error?: string
  }[]
  tokensUsed: number
  tokensAvailable: number
  startTime: Date
  estimatedCompletion?: Date
}

const batchProgressMap = new Map<string, BatchProgress>()

export function updateBatchProgress(userId: string, progress: Partial<BatchProgress>) {
  const existing = batchProgressMap.get(userId) || {
    isProcessing: false,
    userId,
    totalStorefronts: 0,
    processedStorefronts: 0,
    currentBatch: 0,
    totalBatches: 0,
    currentStorefronts: [],
    completedStorefronts: [],
    tokensUsed: 0,
    tokensAvailable: 0,
    startTime: new Date()
  }
  
  batchProgressMap.set(userId, { ...existing, ...progress })
}

export function getBatchProgress(userId: string): BatchProgress | null {
  return batchProgressMap.get(userId) || null
}

export function completeBatchProgress(userId: string) {
  const progress = batchProgressMap.get(userId)
  if (progress) {
    batchProgressMap.set(userId, { ...progress, isProcessing: false })
    // Clean up after 30 seconds instead of 5 minutes for faster UI clearing
    setTimeout(() => {
      batchProgressMap.delete(userId)
    }, 30 * 1000)
  }
}

export function clearBatchProgress(userId: string) {
  batchProgressMap.delete(userId)
}

export { type BatchProgress }