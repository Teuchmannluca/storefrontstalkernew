import { NextRequest, NextResponse } from 'next/server'
import { validateApiRequest } from '@/lib/auth'
import { SchedulerService } from '@/services/scheduler.service'
import { ScheduleManager } from '@/services/schedule-manager'
import { getSchedulerStatus } from '@/lib/scheduler-init'

export async function GET(request: NextRequest) {
  try {
    const user = await validateApiRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scheduler = SchedulerService.getInstance()
    const scheduleManager = ScheduleManager.getInstance()
    
    const systemStatus = getSchedulerStatus()
    
    const storefrontStatus = scheduler.getScheduleStatus(user.id, 'storefront')
    const arbitrageStatus = scheduler.getScheduleStatus(user.id, 'arbitrage')
    
    const storefrontSchedule = await scheduleManager.getUserSchedule(user.id, 'storefront')
    const arbitrageSchedule = await scheduleManager.getUserSchedule(user.id, 'arbitrage')

    return NextResponse.json({
      system: systemStatus,
      schedules: {
        storefront: {
          status: storefrontStatus,
          settings: storefrontSchedule
        },
        arbitrage: {
          status: arbitrageStatus,
          settings: arbitrageSchedule
        }
      }
    })

  } catch (error) {
    console.error('Error getting scheduler status:', error)
    return NextResponse.json(
      { error: 'Failed to get scheduler status', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, type } = body

    if (!type || !['storefront', 'arbitrage'].includes(type)) {
      return NextResponse.json({ error: 'Invalid schedule type' }, { status: 400 })
    }

    const scheduler = SchedulerService.getInstance()

    switch (action) {
      case 'pause':
        scheduler.pauseSchedule(user.id, type)
        return NextResponse.json({ success: true, message: `${type} schedule paused` })
      
      case 'resume':
        scheduler.resumeSchedule(user.id, type)
        return NextResponse.json({ success: true, message: `${type} schedule resumed` })
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Error updating scheduler status:', error)
    return NextResponse.json(
      { error: 'Failed to update scheduler status', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}