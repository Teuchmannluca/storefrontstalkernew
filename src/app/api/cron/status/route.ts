import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    // Basic security check
    const authHeader = request.headers.get('authorization')
    const userAgent = request.headers.get('user-agent')
    
    const isSystemCron = userAgent?.includes('system-cron')
    const isVercelCron = userAgent?.includes('vercel-cron')
    const hasValidAuth = authHeader === `Bearer ${process.env.CRON_SECRET || 'default-secret'}`
    
    if (!isSystemCron && !isVercelCron && !hasValidAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceRoleClient()

    // Get storefront schedules status
    const { data: storefrontSchedules, error: storefrontError } = await supabase
      .from('schedules_due_for_execution')
      .select('*')

    if (storefrontError) {
      console.error('Error fetching storefront schedules:', storefrontError)
    }

    // Get arbitrage schedules status
    const { data: arbitrageSchedules, error: arbitrageError } = await supabase
      .from('arbitrage_schedules_due_for_execution')
      .select('*')

    if (arbitrageError) {
      console.error('Error fetching arbitrage schedules:', arbitrageError)
    }

    // Get recent storefront schedule executions
    const { data: recentStorefrontRuns, error: storefrontRunsError } = await supabase
      .from('user_schedule_settings')
      .select('user_id, last_run, next_run, enabled')
      .not('last_run', 'is', null)
      .order('last_run', { ascending: false })
      .limit(10)

    if (storefrontRunsError) {
      console.error('Error fetching recent storefront runs:', storefrontRunsError)
    }

    // Get recent arbitrage schedule executions
    const { data: recentArbitrageRuns, error: arbitrageRunsError } = await supabase
      .from('user_arbitrage_schedule_settings')
      .select('user_id, last_run, next_run, enabled, scan_type')
      .not('last_run', 'is', null)
      .order('last_run', { ascending: false })
      .limit(10)

    if (arbitrageRunsError) {
      console.error('Error fetching recent arbitrage runs:', arbitrageRunsError)
    }

    // Get total enabled schedules
    const { count: enabledStorefrontSchedules } = await supabase
      .from('user_schedule_settings')
      .select('*', { count: 'exact', head: true })
      .eq('enabled', true)

    const { count: enabledArbitrageSchedules } = await supabase
      .from('user_arbitrage_schedule_settings')
      .select('*', { count: 'exact', head: true })
      .eq('enabled', true)

    // Calculate next execution times
    const now = new Date()
    const nextStorefrontRun = storefrontSchedules && storefrontSchedules.length > 0 
      ? new Date(storefrontSchedules[0].next_run)
      : null
    const nextArbitrageRun = arbitrageSchedules && arbitrageSchedules.length > 0
      ? new Date(arbitrageSchedules[0].next_run)
      : null

    const status = {
      timestamp: now.toISOString(),
      system: {
        status: 'healthy',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      },
      storefronts: {
        enabled_schedules: enabledStorefrontSchedules || 0,
        due_now: storefrontSchedules?.length || 0,
        next_run: nextStorefrontRun?.toISOString() || null,
        next_run_in_minutes: nextStorefrontRun ? Math.round((nextStorefrontRun.getTime() - now.getTime()) / (1000 * 60)) : null,
        recent_executions: recentStorefrontRuns?.map(run => ({
          user_id: run.user_id,
          last_run: run.last_run,
          next_run: run.next_run,
          enabled: run.enabled
        })) || []
      },
      arbitrage: {
        enabled_schedules: enabledArbitrageSchedules || 0,
        due_now: arbitrageSchedules?.length || 0,
        next_run: nextArbitrageRun?.toISOString() || null,
        next_run_in_minutes: nextArbitrageRun ? Math.round((nextArbitrageRun.getTime() - now.getTime()) / (1000 * 60)) : null,
        recent_executions: recentArbitrageRuns?.map(run => ({
          user_id: run.user_id,
          last_run: run.last_run,
          next_run: run.next_run,
          enabled: run.enabled,
          scan_type: run.scan_type
        })) || []
      },
      health_checks: {
        storefront_endpoint: !storefrontError,
        arbitrage_endpoint: !arbitrageError,
        database_connection: true,
        last_check: now.toISOString()
      }
    }

    return NextResponse.json(status)

  } catch (error) {
    console.error('Error in cron status endpoint:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}