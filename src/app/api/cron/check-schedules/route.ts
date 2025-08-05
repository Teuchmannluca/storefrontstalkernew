import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'
import { KeepaUpdateManager } from '@/lib/keepa-update-manager'

interface ScheduleDue {
  id: string
  user_id: string
  email: string
  frequency: string
  time_of_day: string
  timezone: string
  days_of_week: number[]
  last_run: string | null
  next_run: string
}

export async function GET(request: NextRequest) {
  console.log('🕐 Cron job: Checking for scheduled storefront updates...')
  
  try {
    // Verify this is actually a cron request (basic security)
    const authHeader = request.headers.get('authorization')
    const userAgent = request.headers.get('user-agent')
    
    // Check for system cron user agent or allow with correct auth token
    const isSystemCron = userAgent?.includes('system-cron')
    const isVercelCron = userAgent?.includes('vercel-cron')
    const hasValidAuth = authHeader === `Bearer ${process.env.CRON_SECRET || 'default-secret'}`
    
    if (!isSystemCron && !isVercelCron && !hasValidAuth) {
      console.log('❌ Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all schedules that are due for execution
    const supabase = getServiceRoleClient()
    const { data: schedulesDue, error: fetchError } = await supabase
      .from('schedules_due_for_execution')
      .select('*')
      .limit(50) // Process max 50 users per hour to avoid timeouts

    if (fetchError) {
      console.error('❌ Error fetching due schedules:', fetchError)
      throw fetchError
    }

    console.log(`📋 Found ${schedulesDue?.length || 0} schedules due for execution`)

    if (!schedulesDue || schedulesDue.length === 0) {
      return NextResponse.json({ 
        message: 'No schedules due for execution',
        processed: 0 
      })
    }

    const results = []

    // Process each scheduled user
    for (const schedule of schedulesDue as ScheduleDue[]) {
      console.log(`🚀 Processing scheduled update for user ${schedule.email} (${schedule.user_id})`)
      
      try {
        // Initialize update manager for this user
        const updateManager = new KeepaUpdateManager(schedule.user_id)
        
        // Get user's storefronts
        const { data: storefronts, error: storefrontsError } = await supabase
          .from('storefronts')
          .select('id, name')
          .eq('user_id', schedule.user_id)

        if (storefrontsError || !storefronts || storefronts.length === 0) {
          console.log(`⚠️ No storefronts found for user ${schedule.email}`)
          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: false,
            message: 'No storefronts found'
          })
          continue
        }

        console.log(`📊 Found ${storefronts.length} storefronts for ${schedule.email}`)

        // Check if user has sufficient tokens
        const tokenStatus = await updateManager.getQueueStatus()
        const tokensNeeded = storefronts.length * 50 // 50 tokens per storefront
        
        if (tokenStatus.availableTokens < 50) {
          console.log(`⚠️ Insufficient tokens for ${schedule.email}: need 50, have ${tokenStatus.availableTokens}`)
          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: false,
            message: `Insufficient tokens: need 50, have ${tokenStatus.availableTokens}`
          })
          continue
        }

        // Queue the storefront updates
        const storefrontIds = storefronts.map(s => s.id)
        await updateManager.queueStorefrontUpdates(storefrontIds)

        // Process the queue (this will respect rate limits)
        const updateResults = await updateManager.processQueue()
        
        const successful = updateResults.filter(r => r.success).length
        const failed = updateResults.filter(r => !r.success).length
        const totalProductsAdded = updateResults.reduce((sum, r) => sum + r.productsAdded, 0)
        const totalProductsRemoved = updateResults.reduce((sum, r) => sum + r.productsRemoved, 0)
        const totalTokensUsed = updateResults.reduce((sum, r) => sum + r.tokensUsed, 0)

        console.log(`✅ Completed update for ${schedule.email}: ${successful} successful, ${failed} failed`)
        console.log(`📊 Products: +${totalProductsAdded}, -${totalProductsRemoved}, Tokens: ${totalTokensUsed}`)

        // Update the schedule settings with last run and calculate next run
        await updateScheduleAfterExecution(schedule.id, schedule)

        results.push({
          user_id: schedule.user_id,
          email: schedule.email,
          success: true,
          storefronts_processed: successful,
          storefronts_failed: failed,
          products_added: totalProductsAdded,
          products_removed: totalProductsRemoved,
          tokens_used: totalTokensUsed,
          message: `Updated ${successful} storefronts successfully`
        })

      } catch (error) {
        console.error(`❌ Error processing schedule for ${schedule.email}:`, error)
        results.push({
          user_id: schedule.user_id,
          email: schedule.email,
          success: false,
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`🏁 Cron job completed: ${successful} successful, ${failed} failed`)

    return NextResponse.json({
      message: `Processed ${results.length} scheduled updates`,
      successful,
      failed,
      results
    })

  } catch (error) {
    console.error('❌ Error in cron job:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
}

/**
 * Update schedule after execution - set last_run and calculate next_run
 */
async function updateScheduleAfterExecution(scheduleId: string, schedule: ScheduleDue) {
  try {
    const now = new Date().toISOString()
    const supabase = getServiceRoleClient()
    
    // Call the database function to calculate next run
    const { data, error } = await supabase.rpc('calculate_next_run', {
      p_frequency: schedule.frequency,
      p_time_of_day: schedule.time_of_day,
      p_timezone: schedule.timezone,
      p_days_of_week: schedule.days_of_week,
      p_last_run: now
    })

    if (error) {
      console.error('Error calculating next run:', error)
      return
    }

    // Update the schedule record
    const { error: updateError } = await supabase
      .from('user_schedule_settings')
      .update({
        last_run: now,
        next_run: data,
        updated_at: now
      })
      .eq('id', scheduleId)

    if (updateError) {
      console.error('Error updating schedule:', updateError)
    } else {
      console.log(`📅 Updated schedule for next run: ${data}`)
    }

  } catch (error) {
    console.error('Error updating schedule after execution:', error)
  }
}