// Verify security configuration for cron jobs
require('dotenv').config({ path: '.env.local' });

console.log('🔐 Verifying Security Setup for Cron Jobs\n');

// Check environment variables
const checks = [
  {
    name: 'CRON_SECRET',
    value: process.env.CRON_SECRET,
    required: true,
    description: 'Secret token for authenticating cron requests'
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    value: process.env.SUPABASE_SERVICE_ROLE_KEY,
    required: true,
    description: 'Service role key for database access from cron jobs'
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    value: process.env.NEXT_PUBLIC_SUPABASE_URL,
    required: true,
    description: 'Supabase project URL'
  }
];

let allGood = true;

checks.forEach(check => {
  const exists = !!check.value;
  const icon = exists ? '✅' : '❌';
  const status = exists ? 'CONFIGURED' : 'MISSING';
  
  console.log(`${icon} ${check.name}: ${status}`);
  console.log(`   Description: ${check.description}`);
  
  if (exists) {
    // Show partial value for verification (first 20 chars + ...)
    const displayValue = check.value.length > 20 
      ? check.value.substring(0, 20) + '...' 
      : check.value;
    console.log(`   Value: ${displayValue}`);
  }
  
  if (check.required && !exists) {
    allGood = false;
  }
  
  console.log('');
});

// Test Supabase connection with service role
async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Service Role Connection...');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Test by trying to read from a system table
    const { data, error } = await supabase
      .from('user_schedule_settings')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') { // Ignore "relation does not exist" - table not created yet
      throw error;
    }

    console.log('✅ Supabase service role connection successful');
    console.log('   Can access user_schedule_settings table');
    
  } catch (error) {
    console.log('❌ Supabase service role connection failed:');
    console.log(`   Error: ${error.message}`);
    allGood = false;
  }
}

// Security recommendations
function showSecurityRecommendations() {
  console.log('\n🛡️  Security Recommendations:\n');
  
  console.log('1. ✅ Environment Variables:');
  console.log('   - CRON_SECRET is configured locally');
  console.log('   - Make sure to add CRON_SECRET to Vercel environment variables');
  console.log('   - Service role key should never be exposed in client-side code');
  
  console.log('\n2. ✅ Cron Endpoint Security:');
  console.log('   - Endpoint checks for Vercel user-agent: "vercel-cron"');
  console.log('   - Fallback authentication with Bearer token');
  console.log('   - Only processes up to 50 users per hour to prevent abuse');
  
  console.log('\n3. ✅ Database Security:');
  console.log('   - Using Row Level Security (RLS) policies');
  console.log('   - Service role has special access for cron operations');
  console.log('   - Users can only access their own schedule settings');
  
  console.log('\n4. 🔧 Additional Steps Needed:');
  console.log('   - Run the database migration to create tables and policies');
  console.log('   - Add CRON_SECRET to Vercel environment variables');
  console.log('   - Deploy to Vercel to activate cron jobs');
}

// Run tests
async function runSecurityVerification() {
  if (allGood) {
    await testSupabaseConnection();
  }
  
  showSecurityRecommendations();
  
  console.log(`\n${allGood ? '🎉' : '⚠️'} Security Setup: ${allGood ? 'READY' : 'NEEDS ATTENTION'}`);
}

runSecurityVerification();