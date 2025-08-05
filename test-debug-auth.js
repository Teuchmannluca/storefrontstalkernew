#!/usr/bin/env node
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function testDebugAuth() {
  console.log('🔍 Testing auth debug endpoint...\n')
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  try {
    const response = await fetch(`${siteUrl}/api/debug-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    })
    
    const result = await response.json()
    console.log('📋 Debug result:', JSON.stringify(result, null, 2))
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testDebugAuth()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })