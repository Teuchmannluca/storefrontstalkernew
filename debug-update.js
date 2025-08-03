// Debug script to manually test the update system
require('dotenv').config({ path: '.env.local' });
const { KeepaUpdateManager } = require('./src/lib/keepa-update-manager.ts');

async function testUpdateSystem() {
  console.log('🧪 Testing KeepaUpdateManager initialization...');
  
  try {
    // Test with a dummy user ID
    const userId = '1ae92de0-f5d0-4e9f-a4a6-a45e99feb1ba'; // Replace with actual user ID if needed
    
    const manager = new KeepaUpdateManager(userId);
    console.log('✅ KeepaUpdateManager created successfully');
    
    const status = await manager.getQueueStatus();
    console.log('📊 Queue status:', status);
    
  } catch (error) {
    console.error('❌ Error testing update system:', error.message);
    console.error('Stack:', error.stack);
  }
}

testUpdateSystem();