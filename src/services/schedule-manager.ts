import { getServiceRoleClient } from '@/lib/supabase-server'
import { SchedulerService, ScheduleConfig } from './scheduler.service'

export interface StorefrontSchedule {
  id: string
  user_id: string
  enabled: boolean
  frequency: 'daily' | 'every_2_days' | 'weekly'
  time_of_day: string
  timezone: string
  days_of_week?: number[]
  last_run?: string
  next_run?: string
  is_running?: boolean
  last_error?: string
  run_count?: number
}

export interface ArbitrageSchedule extends StorefrontSchedule {
  scan_type?: 'single_seller' | 'all_sellers'
  storefront_id?: string
}

export class ScheduleManager {
  private static instance: ScheduleManager
  private scheduler: SchedulerService

  private constructor() {
    this.scheduler = SchedulerService.getInstance()
  }

  public static getInstance(): ScheduleManager {
    if (!ScheduleManager.instance) {
      ScheduleManager.instance = new ScheduleManager()
    }
    return ScheduleManager.instance
  }

  public async loadAllSchedules(): Promise<void> {
    console.log('📋 Loading all schedules from database...')
    
    try {
      await this.loadStorefrontSchedules()
      await this.loadArbitrageSchedules()
      console.log('✅ All schedules loaded successfully')
    } catch (error) {
      console.error('❌ Error loading schedules:', error)
      throw error
    }
  }

  private async loadStorefrontSchedules(): Promise<void> {
    const supabase = getServiceRoleClient()
    
    const { data: schedules, error } = await supabase
      .from('user_schedule_settings')
      .select('*')
      .eq('enabled', true)

    if (error) {
      console.error('Error loading storefront schedules:', error)
      throw error
    }

    if (!schedules || schedules.length === 0) {
      console.log('No enabled storefront schedules found')
      return
    }

    console.log(`Loading ${schedules.length} storefront schedules`)

    for (const schedule of schedules) {
      const config: ScheduleConfig = {
        userId: schedule.user_id,
        type: 'storefront',
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        timeOfDay: schedule.time_of_day,
        timezone: schedule.timezone,
        daysOfWeek: schedule.days_of_week,
        lastRun: schedule.last_run ? new Date(schedule.last_run) : undefined,
        nextRun: schedule.next_run ? new Date(schedule.next_run) : undefined
      }

      this.scheduler.addOrUpdateSchedule(config)
    }
  }

  private async loadArbitrageSchedules(): Promise<void> {
    const supabase = getServiceRoleClient()
    
    const { data: schedules, error } = await supabase
      .from('user_arbitrage_schedule_settings')
      .select('*')
      .eq('enabled', true)

    if (error) {
      console.error('Error loading arbitrage schedules:', error)
      throw error
    }

    if (!schedules || schedules.length === 0) {
      console.log('No enabled arbitrage schedules found')
      return
    }

    console.log(`Loading ${schedules.length} arbitrage schedules`)

    for (const schedule of schedules) {
      const config: ScheduleConfig = {
        userId: schedule.user_id,
        type: 'arbitrage',
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        timeOfDay: schedule.time_of_day,
        timezone: schedule.timezone,
        daysOfWeek: schedule.days_of_week,
        lastRun: schedule.last_run ? new Date(schedule.last_run) : undefined,
        nextRun: schedule.next_run ? new Date(schedule.next_run) : undefined
      }

      this.scheduler.addOrUpdateSchedule(config)
    }
  }

  public async updateSchedule(
    userId: string,
    type: 'storefront' | 'arbitrage',
    settings: Partial<StorefrontSchedule | ArbitrageSchedule>
  ): Promise<void> {
    const supabase = getServiceRoleClient()
    const table = type === 'storefront' ? 'user_schedule_settings' : 'user_arbitrage_schedule_settings'
    
    const { data, error } = await supabase
      .from(table)
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error(`Error updating ${type} schedule:`, error)
      throw error
    }

    if (data) {
      const config: ScheduleConfig = {
        userId: data.user_id,
        type,
        enabled: data.enabled,
        frequency: data.frequency,
        timeOfDay: data.time_of_day,
        timezone: data.timezone,
        daysOfWeek: data.days_of_week,
        lastRun: data.last_run ? new Date(data.last_run) : undefined,
        nextRun: data.next_run ? new Date(data.next_run) : undefined
      }

      this.scheduler.addOrUpdateSchedule(config)
    }
  }

  public async recordRunStart(userId: string, type: 'storefront' | 'arbitrage'): Promise<void> {
    const supabase = getServiceRoleClient()
    const table = type === 'storefront' ? 'user_schedule_settings' : 'user_arbitrage_schedule_settings'
    
    await supabase
      .from(table)
      .update({
        is_running: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
  }

  public async recordRunComplete(
    userId: string,
    type: 'storefront' | 'arbitrage',
    success: boolean,
    error?: string
  ): Promise<void> {
    const supabase = getServiceRoleClient()
    const table = type === 'storefront' ? 'user_schedule_settings' : 'user_arbitrage_schedule_settings'
    
    const now = new Date().toISOString()
    
    const { data: current } = await supabase
      .from(table)
      .select('run_count, frequency, time_of_day, timezone, days_of_week')
      .eq('user_id', userId)
      .single()
    
    const runCount = (current?.run_count || 0) + 1
    
    const { data: nextRun } = await supabase.rpc('calculate_next_run', {
      p_frequency: current?.frequency,
      p_time_of_day: current?.time_of_day,
      p_timezone: current?.timezone,
      p_days_of_week: current?.days_of_week,
      p_last_run: now
    })
    
    await supabase
      .from(table)
      .update({
        is_running: false,
        last_run: now,
        next_run: nextRun,
        last_error: error || null,
        run_count: runCount,
        updated_at: now
      })
      .eq('user_id', userId)
  }

  public async getUserSchedule(
    userId: string,
    type: 'storefront' | 'arbitrage'
  ): Promise<StorefrontSchedule | ArbitrageSchedule | null> {
    const supabase = getServiceRoleClient()
    const table = type === 'storefront' ? 'user_schedule_settings' : 'user_arbitrage_schedule_settings'
    
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    return data
  }

  public async createOrUpdateSchedule(
    userId: string,
    type: 'storefront' | 'arbitrage',
    settings: Partial<StorefrontSchedule | ArbitrageSchedule>
  ): Promise<void> {
    const supabase = getServiceRoleClient()
    const table = type === 'storefront' ? 'user_schedule_settings' : 'user_arbitrage_schedule_settings'
    
    const existing = await this.getUserSchedule(userId, type)
    
    if (existing) {
      await this.updateSchedule(userId, type, settings)
    } else {
      const { error } = await supabase
        .from(table)
        .insert({
          user_id: userId,
          ...settings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) {
        console.error(`Error creating ${type} schedule:`, error)
        throw error
      }

      if (settings.enabled) {
        const config: ScheduleConfig = {
          userId,
          type,
          enabled: settings.enabled || false,
          frequency: settings.frequency || 'daily',
          timeOfDay: settings.time_of_day || '02:00',
          timezone: settings.timezone || 'UTC',
          daysOfWeek: settings.days_of_week
        }

        this.scheduler.addOrUpdateSchedule(config)
      }
    }
  }

  public async getScheduleStatuses(): Promise<any[]> {
    const statuses = this.scheduler.getAllStatuses()
    const enrichedStatuses = []

    for (const status of statuses) {
      const dbSchedule = await this.getUserSchedule(status.userId, status.type)
      
      enrichedStatuses.push({
        ...status,
        enabled: dbSchedule?.enabled || false,
        frequency: dbSchedule?.frequency,
        timeOfDay: dbSchedule?.time_of_day,
        timezone: dbSchedule?.timezone
      })
    }

    return enrichedStatuses
  }
}