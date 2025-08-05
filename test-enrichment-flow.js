#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkEnrichmentQueue() {
  console.log('🔍 Checking enrichment queue status...\n')
  
  // Get overall stats
  const { data: stats, error } = await supabase
    .from('asin_enrichment_queue')
    .select('status, asin, attempts, last_error, updated_at')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('❌ Error fetching queue:', error)
    return
  }
  
  // Count by status
  const statusCounts = {
    pending: 0,
    processing: 0,
    completed: 0,
    error: 0
  }
  
  const { data: allStats } = await supabase
    .from('asin_enrichment_queue')
    .select('status')
  
  allStats?.forEach(item => {
    statusCounts[item.status]++
  })
  
  console.log('📊 Queue Status Summary:')
  console.log(`   Pending: ${statusCounts.pending}`)
  console.log(`   Processing: ${statusCounts.processing}`)
  console.log(`   Completed: ${statusCounts.completed}`)
  console.log(`   Error: ${statusCounts.error}`)
  console.log(`   Total: ${allStats?.length || 0}\n`)
  
  if (stats && stats.length > 0) {
    console.log('📋 Recent Queue Items:')
    stats.forEach(item => {
      const status = item.status.padEnd(10)
      const attempts = `(${item.attempts} attempts)`
      const time = new Date(item.updated_at).toLocaleString()
      console.log(`   ${status} ${item.asin} ${attempts} - ${time}`)
      if (item.last_error) {
        console.log(`      Error: ${item.last_error}`)
      }
    })
  }
  
  // Check for stuck processing items
  const { data: processingItems } = await supabase
    .from('asin_enrichment_queue')
    .select('asin, updated_at')
    .eq('status', 'processing')
  
  if (processingItems && processingItems.length > 0) {
    console.log('\n⚠️  Items stuck in processing:')
    processingItems.forEach(item => {
      const minutesAgo = Math.floor((Date.now() - new Date(item.updated_at).getTime()) / 60000)
      console.log(`   ${item.asin} - ${minutesAgo} minutes ago`)
    })
  }
}

// Run the check
checkEnrichmentQueue()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })