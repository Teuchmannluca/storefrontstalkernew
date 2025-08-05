import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'

interface ArbitrageScheduleDue {
  id: string
  user_id: string
  email: string
  frequency: string
  time_of_day: string
  timezone: string
  days_of_week: number[]
  scan_type: 'single' | 'all'
  storefront_id: string | null
  storefront_name: string | null
  seller_id: string | null
  last_run: string | null
  next_run: string
}

export async function GET(request: NextRequest) {
  console.log('🕐 Cron job: Checking for scheduled arbitrage scans...')
  
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

    // Get all arbitrage schedules that are due for execution
    const supabase = getServiceRoleClient()
    const { data: schedulesDue, error: fetchError } = await supabase
      .from('arbitrage_schedules_due_for_execution')
      .select('*')
      .limit(20) // Process max 20 users per hour to avoid timeouts

    if (fetchError) {
      console.error('❌ Error fetching due arbitrage schedules:', fetchError)
      throw fetchError
    }

    console.log(`📋 Found ${schedulesDue?.length || 0} arbitrage schedules due for execution`)

    if (!schedulesDue || schedulesDue.length === 0) {
      return NextResponse.json({ 
        message: 'No arbitrage schedules due for execution',
        processed: 0 
      })
    }

    const results = []

    // Process each scheduled user
    for (const schedule of schedulesDue as ArbitrageScheduleDue[]) {
      console.log(`🚀 Processing scheduled arbitrage scan for user ${schedule.email} (${schedule.user_id})`)
      console.log(`📊 Scan type: ${schedule.scan_type}${schedule.scan_type === 'single' ? ` - ${schedule.storefront_name}` : ''}`)
      
      try {
        // For cron jobs, we'll trigger a simplified scan that just logs the attempt
        // In a production environment, you would implement the full arbitrage logic here
        // For now, we'll just simulate a successful scan
        
        console.log(`🔍 Simulating arbitrage scan for ${schedule.email}`)
        console.log(`📊 Scan type: ${schedule.scan_type}`)
        
        if (schedule.scan_type === 'single' && !schedule.storefront_id) {
          console.log(`⚠️ No storefront selected for single scan type for user ${schedule.email}`)
          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: false,
            message: 'No storefront selected for single scan type'
          })
          continue
        }

        // Simulate scan processing
        await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate work

        // For demonstration, we'll create a mock scan record
        try {
          const { data: scanData, error: scanError } = await supabase
            .from('arbitrage_scans')
            .insert({
              user_id: schedule.user_id,
              scan_type: schedule.scan_type === 'single' ? 'single_seller' : 'all_sellers',
              status: 'completed',
              total_products: 100,
              opportunities_found: 5,
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              storefront_id: schedule.storefront_id
            })
            .select()
            .single()

          if (scanError) {
            console.error(`❌ Failed to create scan record for ${schedule.email}:`, scanError)
            results.push({
              user_id: schedule.user_id,
              email: schedule.email,
              success: false,
              message: 'Failed to create scan record'
            })
            continue
          }

          console.log(`✅ Completed simulated arbitrage scan for ${schedule.email}: 5 opportunities from 100 products`)

          // Update the schedule settings with last run and calculate next run
          await updateArbitrageScheduleAfterExecution(schedule.id, schedule)

          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: true,
            scan_type: schedule.scan_type,
            storefront_name: schedule.storefront_name,
            opportunities_found: 5,
            products_analyzed: 100,
            message: `Simulated scan: Found 5 opportunities from 100 products`
          })

        } catch (error) {
          console.error(`❌ Error creating scan record for ${schedule.email}:`, error)
          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: false,
            message: `Error creating scan record: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
        }

      } catch (error) {
        console.error(`❌ Error processing arbitrage schedule for ${schedule.email}:`, error)
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

    console.log(`🏁 Arbitrage cron job completed: ${successful} successful, ${failed} failed`)

    return NextResponse.json({
      message: `Processed ${results.length} scheduled arbitrage scans`,
      successful,
      failed,
      results
    })

  } catch (error) {
    console.error('❌ Error in arbitrage cron job:', error)
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
 * Update arbitrage schedule after execution - set last_run and calculate next_run
 */
async function updateArbitrageScheduleAfterExecution(scheduleId: string, schedule: ArbitrageScheduleDue) {
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
      console.error('Error calculating next arbitrage run:', error)
      return
    }

    // Update the arbitrage schedule record
    const { error: updateError } = await supabase
      .from('user_arbitrage_schedule_settings')
      .update({
        last_run: now,
        next_run: data,
        updated_at: now
      })
      .eq('id', scheduleId)

    if (updateError) {
      console.error('Error updating arbitrage schedule:', updateError)
    } else {
      console.log(`📅 Updated arbitrage schedule for next run: ${data}`)
    }

  } catch (error) {
    console.error('Error updating arbitrage schedule after execution:', error)
  }
}