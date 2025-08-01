#!/usr/bin/env node

/**
 * Background sync script for catalog items
 * Can be run as a cron job to periodically update product details
 * 
 * Usage: node scripts/sync-catalog.js
 * 
 * Set SYNC_SECRET_TOKEN in environment variables
 * Rate limits: 2 requests/second, so ~120 products/minute
 */

require('dotenv').config({ path: '.env.local' });

const SYNC_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
const SYNC_TOKEN = process.env.SYNC_SECRET_TOKEN;

if (!SYNC_TOKEN) {
  console.error('SYNC_SECRET_TOKEN not set in environment variables');
  process.exit(1);
}

async function runSync() {
  console.log(`Starting catalog sync at ${new Date().toISOString()}`);
  
  try {
    // First check the status
    const statusResponse = await fetch(`${SYNC_URL}/api/sync/background-catalog`);
    const status = await statusResponse.json();
    
    console.log('Current sync status:', status);
    
    if (status.pendingSync === 0) {
      console.log('No products need syncing');
      return;
    }
    
    // Run the sync
    const syncResponse = await fetch(`${SYNC_URL}/api/sync/background-catalog`, {
      method: 'POST',
      headers: {
        'x-sync-token': SYNC_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await syncResponse.json();
    
    if (syncResponse.ok) {
      console.log('Sync completed successfully:', result);
    } else {
      console.error('Sync failed:', result);
    }
    
  } catch (error) {
    console.error('Error running sync:', error);
  }
}

// Run the sync
runSync().then(() => {
  console.log('Sync script completed');
}).catch(error => {
  console.error('Sync script error:', error);
  process.exit(1);
});