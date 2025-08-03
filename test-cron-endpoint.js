// Test the cron endpoint locally
require('dotenv').config({ path: '.env.local' });

async function testCronEndpoint() {
  console.log('🧪 Testing cron endpoint...');
  
  try {
    const response = await fetch('http://localhost:3000/api/cron/check-schedules', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || 'default-secret'}`,
        'User-Agent': 'test-client'
      }
    });

    console.log('📡 Response status:', response.status);
    
    const data = await response.json();
    console.log('📊 Response data:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.log('❌ Cron endpoint returned error:', data);
    } else {
      console.log('✅ Cron endpoint successful:', data.message);
    }

  } catch (error) {
    console.error('❌ Error calling cron endpoint:', error.message);
  }
}

testCronEndpoint();