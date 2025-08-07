import { NextRequest, NextResponse } from 'next/server'
import { validateApiRequest } from '@/lib/auth'
import { ScheduleManager } from '@/services/schedule-manager'

export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, settings } = body

    if (!type || !['storefront', 'arbitrage'].includes(type)) {
      return NextResponse.json({ error: 'Invalid schedule type' }, { status: 400 })
    }

    if (!settings) {
      return NextResponse.json({ error: 'Settings are required' }, { status: 400 })
    }

    const scheduleManager = ScheduleManager.getInstance()
    
    await scheduleManager.createOrUpdateSchedule(user.id, type, settings)

    const updatedSchedule = await scheduleManager.getUserSchedule(user.id, type)

    return NextResponse.json({
      success: true,
      message: `${type} schedule updated successfully`,
      schedule: updatedSchedule
    })

  } catch (error) {
    console.error('Error updating schedule:', error)
    return NextResponse.json(
      { error: 'Failed to update schedule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}