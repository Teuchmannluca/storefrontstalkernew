import { SchedulerService } from '@/services/scheduler.service'
import { ScheduleManager } from '@/services/schedule-manager'
import { JobExecutor } from '@/services/job-executor'

let isInitialized = false

export async function initializeScheduler(): Promise<void> {
  if (isInitialized) {
    console.log('⚠️ Scheduler already initialized')
    return
  }

  // Allow scheduler in development if explicitly enabled
  const enableInDev = process.env.ENABLE_SCHEDULER_IN_DEV === 'true'
  if (process.env.NODE_ENV !== 'production' && !enableInDev) {
    console.log('⏭️ Skipping scheduler initialization in development mode')
    console.log('   Set ENABLE_SCHEDULER_IN_DEV=true to enable')
    return
  }

  console.log('🚀 Initializing scheduler system...')

  try {
    const scheduler = SchedulerService.getInstance()
    const scheduleManager = ScheduleManager.getInstance()
    const jobExecutor = JobExecutor.getInstance()

    scheduler.initialize(async (userId, type) => {
      await jobExecutor.executeJob(userId, type)
    })

    await scheduleManager.loadAllSchedules()

    isInitialized = true
    console.log('✅ Scheduler system initialized successfully')

    process.on('SIGTERM', () => {
      console.log('📛 SIGTERM received, shutting down scheduler...')
      scheduler.shutdown()
      process.exit(0)
    })

    process.on('SIGINT', () => {
      console.log('📛 SIGINT received, shutting down scheduler...')
      scheduler.shutdown()
      process.exit(0)
    })

  } catch (error) {
    console.error('❌ Failed to initialize scheduler:', error)
    throw error
  }
}

export function getSchedulerStatus(): {
  initialized: boolean
  activeSchedules: number
} {
  if (!isInitialized) {
    return {
      initialized: false,
      activeSchedules: 0
    }
  }

  const scheduler = SchedulerService.getInstance()
  const statuses = scheduler.getAllStatuses()

  return {
    initialized: true,
    activeSchedules: statuses.length
  }
}