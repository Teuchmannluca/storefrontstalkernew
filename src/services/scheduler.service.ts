import * as cron from 'node-cron'
import { ScheduledTask } from 'node-cron'

export interface ScheduleConfig {
  userId: string
  type: 'storefront' | 'arbitrage'
  enabled: boolean
  frequency: 'daily' | 'every_2_days' | 'weekly'
  timeOfDay: string
  timezone: string
  daysOfWeek?: number[]
  lastRun?: Date
  nextRun?: Date
}

export interface ScheduleStatus {
  userId: string
  type: 'storefront' | 'arbitrage'
  isRunning: boolean
  nextRun?: Date
  lastRun?: Date
  lastError?: string
  runCount: number
}

type JobHandler = (userId: string, type: 'storefront' | 'arbitrage') => Promise<void>

export class SchedulerService {
  private static instance: SchedulerService
  private tasks: Map<string, ScheduledTask> = new Map()
  private statuses: Map<string, ScheduleStatus> = new Map()
  private jobHandler?: JobHandler
  private isInitialized = false

  private constructor() {}

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService()
    }
    return SchedulerService.instance
  }

  public initialize(jobHandler: JobHandler): void {
    if (this.isInitialized) {
      console.log('⚠️ Scheduler already initialized')
      return
    }

    this.jobHandler = jobHandler
    this.isInitialized = true
    console.log('✅ Scheduler service initialized')
  }

  public addOrUpdateSchedule(config: ScheduleConfig): void {
    const key = this.getScheduleKey(config.userId, config.type)
    
    this.removeSchedule(config.userId, config.type)

    if (!config.enabled) {
      console.log(`⏸️ Schedule disabled for user ${config.userId} (${config.type})`)
      return
    }

    const cronExpression = this.buildCronExpression(config)
    if (!cronExpression) {
      console.error(`❌ Failed to build cron expression for user ${config.userId}`)
      return
    }

    console.log(`📅 Setting schedule for user ${config.userId} (${config.type}): ${cronExpression}`)

    const task = cron.schedule(
      cronExpression,
      async () => {
        await this.executeJob(config.userId, config.type)
      },
      {
        timezone: config.timezone || 'UTC'
      }
    )

    this.tasks.set(key, task)
    
    this.statuses.set(key, {
      userId: config.userId,
      type: config.type,
      isRunning: false,
      nextRun: this.calculateNextRun(config),
      lastRun: config.lastRun,
      runCount: 0
    })

    console.log(`✅ Schedule added for user ${config.userId} (${config.type})`)
  }

  public removeSchedule(userId: string, type: 'storefront' | 'arbitrage'): void {
    const key = this.getScheduleKey(userId, type)
    const task = this.tasks.get(key)
    
    if (task) {
      task.stop()
      this.tasks.delete(key)
      this.statuses.delete(key)
      console.log(`🗑️ Schedule removed for user ${userId} (${type})`)
    }
  }

  public async triggerManualRun(userId: string, type: 'storefront' | 'arbitrage'): Promise<void> {
    console.log(`🚀 Manual trigger for user ${userId} (${type})`)
    await this.executeJob(userId, type)
  }

  public getScheduleStatus(userId: string, type: 'storefront' | 'arbitrage'): ScheduleStatus | undefined {
    const key = this.getScheduleKey(userId, type)
    return this.statuses.get(key)
  }

  public getAllStatuses(): ScheduleStatus[] {
    return Array.from(this.statuses.values())
  }

  public isScheduleRunning(userId: string, type: 'storefront' | 'arbitrage'): boolean {
    const status = this.getScheduleStatus(userId, type)
    return status?.isRunning || false
  }

  public pauseSchedule(userId: string, type: 'storefront' | 'arbitrage'): void {
    const key = this.getScheduleKey(userId, type)
    const task = this.tasks.get(key)
    
    if (task) {
      task.stop()
      console.log(`⏸️ Schedule paused for user ${userId} (${type})`)
    }
  }

  public resumeSchedule(userId: string, type: 'storefront' | 'arbitrage'): void {
    const key = this.getScheduleKey(userId, type)
    const task = this.tasks.get(key)
    
    if (task) {
      task.start()
      console.log(`▶️ Schedule resumed for user ${userId} (${type})`)
    }
  }

  public shutdown(): void {
    console.log('🛑 Shutting down scheduler service...')
    
    for (const [key, task] of this.tasks.entries()) {
      task.stop()
      console.log(`  Stopped schedule: ${key}`)
    }
    
    this.tasks.clear()
    this.statuses.clear()
    this.isInitialized = false
    
    console.log('✅ Scheduler service shut down')
  }

  private async executeJob(userId: string, type: 'storefront' | 'arbitrage'): Promise<void> {
    const key = this.getScheduleKey(userId, type)
    const status = this.statuses.get(key)
    
    if (!status) {
      console.error(`❌ No status found for ${key}`)
      return
    }

    if (status.isRunning) {
      console.log(`⚠️ Job already running for ${key}`)
      return
    }

    if (!this.jobHandler) {
      console.error('❌ No job handler configured')
      return
    }

    status.isRunning = true
    status.lastError = undefined
    this.statuses.set(key, status)

    console.log(`🏃 Executing job for ${key}`)

    try {
      await this.jobHandler(userId, type)
      
      status.lastRun = new Date()
      status.runCount++
      console.log(`✅ Job completed for ${key}`)
    } catch (error) {
      status.lastError = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Job failed for ${key}:`, error)
    } finally {
      status.isRunning = false
      this.statuses.set(key, status)
    }
  }

  private buildCronExpression(config: ScheduleConfig): string | null {
    try {
      const [hour, minute] = config.timeOfDay.split(':').map(Number)
      
      switch (config.frequency) {
        case 'daily':
          return `${minute} ${hour} * * *`
        
        case 'every_2_days':
          return `${minute} ${hour} */2 * *`
        
        case 'weekly':
          if (!config.daysOfWeek || config.daysOfWeek.length === 0) {
            return null
          }
          const days = config.daysOfWeek.map(d => d === 7 ? 0 : d).join(',')
          return `${minute} ${hour} * * ${days}`
        
        default:
          return null
      }
    } catch (error) {
      console.error('Error building cron expression:', error)
      return null
    }
  }

  private calculateNextRun(config: ScheduleConfig): Date {
    const now = new Date()
    const [hour, minute] = config.timeOfDay.split(':').map(Number)
    const next = new Date()
    
    next.setHours(hour, minute, 0, 0)
    
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }
    
    switch (config.frequency) {
      case 'every_2_days':
        if (config.lastRun) {
          const daysSinceLastRun = Math.floor((now.getTime() - config.lastRun.getTime()) / (1000 * 60 * 60 * 24))
          if (daysSinceLastRun < 2) {
            next.setDate(next.getDate() + (2 - daysSinceLastRun))
          }
        }
        break
      
      case 'weekly':
        if (config.daysOfWeek && config.daysOfWeek.length > 0) {
          const currentDay = next.getDay() === 0 ? 7 : next.getDay()
          const nextDay = config.daysOfWeek.find(d => d > currentDay) || config.daysOfWeek[0]
          const daysToAdd = nextDay > currentDay ? nextDay - currentDay : 7 - currentDay + nextDay
          next.setDate(next.getDate() + daysToAdd)
        }
        break
    }
    
    return next
  }

  private getScheduleKey(userId: string, type: 'storefront' | 'arbitrage'): string {
    return `${userId}_${type}`
  }
}