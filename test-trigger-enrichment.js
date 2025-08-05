#!/usr/bin/env node
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function triggerEnrichment() {
  console.log('🚀 Triggering title enrichment...\n')
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  console.log(`📍 API URL: ${siteUrl}/api/enrich-titles`)
  console.log(`🔑 Service role key: ${serviceRoleKey ? 'Present' : 'Missing'}\n`)
  
  try {
    const response = await fetch(`${siteUrl}/api/enrich-titles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    })
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`)
    
    const result = await response.json()
    console.log('📋 Response:', JSON.stringify(result, null, 2))
    
    if (response.ok) {
      console.log('\n✅ Title enrichment started successfully!')
      console.log('⏳ Check the queue status in a few seconds to see progress.')
    } else {
      console.log('\n❌ Failed to start enrichment')
    }
    
  } catch (error) {
    console.error('❌ Error triggering enrichment:', error)
  }
}

// Run the trigger
triggerEnrichment()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })