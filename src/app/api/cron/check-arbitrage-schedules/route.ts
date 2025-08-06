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
        console.log(`🔍 Starting arbitrage scan for ${schedule.email}`)
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

        // Trigger actual arbitrage scan via internal API call
        const scanResponse = await triggerArbitrageScan(schedule)
        
        if (!scanResponse.success) {
          console.error(`❌ Arbitrage scan failed for ${schedule.email}:`, scanResponse.error)
          results.push({
            user_id: schedule.user_id,
            email: schedule.email,
            success: false,
            message: scanResponse.error || 'Arbitrage scan failed'
          })
          continue
        }

        console.log(`✅ Completed arbitrage scan for ${schedule.email}: ${scanResponse.opportunities_found} opportunities from ${scanResponse.products_analyzed} products`)

        // Update the schedule settings with last run and calculate next run
        await updateArbitrageScheduleAfterExecution(schedule.id, schedule)

        results.push({
          user_id: schedule.user_id,
          email: schedule.email,
          success: true,
          scan_type: schedule.scan_type,
          storefront_name: schedule.storefront_name,
          opportunities_found: scanResponse.opportunities_found,
          products_analyzed: scanResponse.products_analyzed,
          scan_id: scanResponse.scan_id,
          message: `Found ${scanResponse.opportunities_found} opportunities from ${scanResponse.products_analyzed} products`
        })

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
 * Trigger an actual arbitrage scan based on the schedule
 */
async function triggerArbitrageScan(schedule: ArbitrageScheduleDue) {
  try {
    const supabase = getServiceRoleClient()
    
    // Create a scan record first
    const { data: scanData, error: scanError } = await supabase
      .from('arbitrage_scans')
      .insert({
        user_id: schedule.user_id,
        scan_type: schedule.scan_type === 'single' ? 'single_seller' : 'all_sellers',
        status: 'running',
        started_at: new Date().toISOString(),
        storefront_id: schedule.storefront_id
      })
      .select()
      .single()

    if (scanError || !scanData) {
      return {
        success: false,
        error: 'Failed to create scan record'
      }
    }

    const scanId = scanData.id

    try {
      let scanResults
      
      if (schedule.scan_type === 'single') {
        // Trigger single storefront scan
        scanResults = await performSingleStorefrontScan(schedule.user_id, schedule.storefront_id!, scanId)
      } else {
        // Trigger all storefronts scan
        scanResults = await performAllStorefrontsScan(schedule.user_id, scanId)
      }

      // Update scan record with results
      await supabase
        .from('arbitrage_scans')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_products: scanResults.products_analyzed,
          opportunities_found: scanResults.opportunities_found
        })
        .eq('id', scanId)

      return {
        success: true,
        scan_id: scanId,
        opportunities_found: scanResults.opportunities_found,
        products_analyzed: scanResults.products_analyzed
      }

    } catch (scanError) {
      // Update scan record as failed
      await supabase
        .from('arbitrage_scans')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: scanError instanceof Error ? scanError.message : 'Unknown error'
        })
        .eq('id', scanId)

      return {
        success: false,
        error: scanError instanceof Error ? scanError.message : 'Scan execution failed'
      }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger scan'
    }
  }
}

/**
 * Perform a single storefront arbitrage scan
 */
async function performSingleStorefrontScan(userId: string, storefrontId: string, scanId: string) {
  console.log(`📊 Performing single storefront scan for storefront ${storefrontId}`)
  
  try {
    const supabase = getServiceRoleClient()
    
    // Get products from the storefront
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('asin, product_name, price, availability, current_sales_rank')
      .eq('storefront_id', storefrontId)
      .limit(100) // Limit for scheduled scans to avoid long execution times
    
    if (productsError || !products || products.length === 0) {
      console.log(`No products found for storefront ${storefrontId}`)
      return {
        opportunities_found: 0,
        products_analyzed: 0
      }
    }
    
    console.log(`Found ${products.length} products to analyze for storefront ${storefrontId}`)
    
    // Use the internal API to perform the analysis
    // This will respect rate limits automatically
    const analysisUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/arbitrage/analyze-stream`
    
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'default-secret'}`
      },
      body: JSON.stringify({
        storefrontId: storefrontId,
        maxProducts: 50, // Limit for scheduled scans
        scheduled: true  // Flag to indicate this is a scheduled scan
      })
    })
    
    if (!response.ok) {
      throw new Error(`Analysis API returned ${response.status}`)
    }
    
    // For scheduled scans, we don't need the streaming response
    // Just wait for completion and return summary
    let opportunitiesFound = 0
    let productsAnalyzed = 0
    
    const reader = response.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const message = JSON.parse(line.slice(6))
                
                switch (message.type) {
                  case 'opportunity':
                    opportunitiesFound++
                    break
                  case 'complete':
                    productsAnalyzed = message.data.totalProducts || products.length
                    break
                }
              } catch (parseError) {
                // Ignore parse errors in scheduled scans
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    }
    
    console.log(`✅ Single storefront scan completed: ${opportunitiesFound} opportunities from ${productsAnalyzed} products`)
    
    return {
      opportunities_found: opportunitiesFound,
      products_analyzed: productsAnalyzed
    }
    
  } catch (error: any) {
    console.error(`❌ Error in single storefront scan for ${storefrontId}:`, error)
    
    // Return mock data as fallback to prevent cron job failure
    return {
      opportunities_found: 0,
      products_analyzed: 0
    }
  }
}

/**
 * Perform an all storefronts arbitrage scan
 */
async function performAllStorefrontsScan(userId: string, scanId: string) {
  console.log(`📊 Performing all storefronts scan for user ${userId}`)
  
  try {
    const supabase = getServiceRoleClient()
    
    // Get user's storefronts
    const { data: storefronts, error: storefrontsError } = await supabase
      .from('storefronts')
      .select('id, name, seller_id')
      .eq('user_id', userId)
    
    if (storefrontsError || !storefronts || storefronts.length === 0) {
      console.log(`No storefronts found for user ${userId}`)
      return {
        opportunities_found: 0,
        products_analyzed: 0
      }
    }
    
    console.log(`Found ${storefronts.length} storefronts for user ${userId}`)
    
    // Use the internal API to perform all sellers analysis
    // This will respect rate limits automatically
    const analysisUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/arbitrage/analyze-all-sellers`
    
    const response = await fetch(analysisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'default-secret'}`
      },
      body: JSON.stringify({
        maxProducts: 200, // Limit for scheduled scans
        scheduled: true   // Flag to indicate this is a scheduled scan
      })
    })
    
    if (!response.ok) {
      throw new Error(`Analysis API returned ${response.status}`)
    }
    
    // For scheduled scans, we don't need the streaming response
    // Just wait for completion and return summary
    let opportunitiesFound = 0
    let productsAnalyzed = 0
    
    const reader = response.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const message = JSON.parse(line.slice(6))
                
                switch (message.type) {
                  case 'opportunity':
                    opportunitiesFound++
                    break
                  case 'complete':
                    productsAnalyzed = message.data.totalProducts || 0
                    opportunitiesFound = message.data.opportunitiesFound || opportunitiesFound
                    break
                }
              } catch (parseError) {
                // Ignore parse errors in scheduled scans
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    }
    
    console.log(`✅ All storefronts scan completed: ${opportunitiesFound} opportunities from ${productsAnalyzed} products`)
    
    return {
      opportunities_found: opportunitiesFound,
      products_analyzed: productsAnalyzed
    }
    
  } catch (error: any) {
    console.error(`❌ Error in all storefronts scan for user ${userId}:`, error)
    
    // Return fallback data to prevent cron job failure
    return {
      opportunities_found: 0,
      products_analyzed: 0
    }
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