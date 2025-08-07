import { NextRequest, NextResponse } from 'next/server'
import { validateApiRequest } from '@/lib/auth'
import { SchedulerService } from '@/services/scheduler.service'
import { JobExecutor } from '@/services/job-executor'

export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type } = body

    if (!type || !['storefront', 'arbitrage'].includes(type)) {
      return NextResponse.json({ error: 'Invalid schedule type' }, { status: 400 })
    }

    const scheduler = SchedulerService.getInstance()
    
    if (scheduler.isScheduleRunning(user.id, type)) {
      return NextResponse.json(
        { error: 'Schedule is already running' },
        { status: 409 }
      )
    }

    const jobExecutor = JobExecutor.getInstance()

    console.log(`🚀 Manual trigger requested for ${type} by user ${user.id}`)

    jobExecutor.executeJob(user.id, type).then(() => {
      console.log(`✅ Manual ${type} job completed for user ${user.id}`)
    }).catch(error => {
      console.error(`❌ Manual ${type} job failed for user ${user.id}:`, error)
    })

    return NextResponse.json({
      success: true,
      message: `${type} update triggered successfully. Check the status for progress.`
    })

  } catch (error) {
    console.error('Error triggering schedule:', error)
    return NextResponse.json(
      { error: 'Failed to trigger schedule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}