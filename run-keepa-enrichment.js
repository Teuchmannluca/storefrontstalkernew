#!/usr/bin/env node

/**
 * Manual Keepa Enrichment Script
 * Run this to enrich products with Keepa data without using cron jobs
 * 
 * Usage: node run-keepa-enrichment.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function runKeepaEnrichment() {
  console.log('🔄 Starting Keepa enrichment...\n');
  
  const keepaApiKey = process.env.KEEPA_API_KEY;
  if (!keepaApiKey) {
    console.error('❌ KEEPA_API_KEY not found in .env.local');
    return;
  }
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    // Get products that need Keepa data
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: products, error } = await supabase
      .from('products')
      .select('asin, user_id, product_name')
      .or(`keepa_last_updated.is.null,keepa_last_updated.lt.${twentyFourHoursAgo}`)
      .limit(20);
    
    if (error) {
      console.error('Error fetching products:', error);
      return;
    }
    
    if (!products || products.length === 0) {
      console.log('✅ All products are up to date!');
      return;
    }
    
    console.log(`📦 Found ${products.length} products to enrich:\n`);
    products.forEach(p => console.log(`  - ${p.asin}: ${p.product_name || 'Unknown'}`));
    console.log('');
    
    // Make HTTP request to the enrichment endpoint
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET || 'default-secret';
    
    console.log('🌐 Calling enrichment endpoint...');
    
    const response = await fetch(`${siteUrl}/api/cron/keepa-enrichment`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('\n✅ Enrichment complete!');
    console.log(`   Enriched: ${result.enriched} products`);
    console.log(`   Processed: ${result.processed} products`);
    
    if (result.enriched > 0) {
      // Show updated products
      const { data: updatedProducts } = await supabase
        .from('products')
        .select('asin, product_name, keepa_estimated_sales, keepa_competitor_count')
        .in('asin', products.map(p => p.asin))
        .not('keepa_last_updated', 'is', null);
      
      if (updatedProducts && updatedProducts.length > 0) {
        console.log('\n📊 Updated products:');
        updatedProducts.forEach(p => {
          console.log(`   ${p.asin}: ${p.keepa_estimated_sales || 0} sales/month, ${p.keepa_competitor_count || 0} competitors`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the enrichment
runKeepaEnrichment().catch(console.error);