// Simple test script to check the update system components
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Test environment variables
console.log('🔍 Checking environment variables...');
const requiredVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'KEEPA_API_KEY',
  'AMAZON_ACCESS_KEY_ID',
  'AMAZON_SECRET_ACCESS_KEY',
  'AMAZON_REFRESH_TOKEN',
  'AMAZON_MARKETPLACE_ID'
];

const missing = [];
requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    missing.push(varName);
  } else {
    console.log(`✅ ${varName}: Set`);
  }
});

if (missing.length > 0) {
  console.log('❌ Missing environment variables:');
  missing.forEach(varName => {
    console.log(`   - ${varName}`);
  });
}

// Test Supabase connection
async function testSupabase() {
  console.log('\n🔍 Testing Supabase connection...');
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test basic connection
    const { data, error } = await supabase
      .from('storefronts')
      .select('count')
      .limit(1);

    if (error) {
      console.log('❌ Supabase connection error:', error.message);
    } else {
      console.log('✅ Supabase connection successful');
    }

    // Check if new tables exist
    const { data: queueCheck, error: queueError } = await supabase
      .from('storefront_update_queue')
      .select('count')
      .limit(1);

    if (queueError) {
      console.log('❌ storefront_update_queue table missing - need to run migration');
      console.log('   Error:', queueError.message);
    } else {
      console.log('✅ storefront_update_queue table exists');
    }

    const { data: tokenCheck, error: tokenError } = await supabase
      .from('keepa_token_tracker')
      .select('count')
      .limit(1);

    if (tokenError) {
      console.log('❌ keepa_token_tracker table missing - need to run migration');
      console.log('   Error:', tokenError.message);
    } else {
      console.log('✅ keepa_token_tracker table exists');
    }

  } catch (error) {
    console.log('❌ Supabase test failed:', error.message);
  }
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  testSupabase();
} else {
  console.log('❌ Cannot test Supabase - missing credentials');
}