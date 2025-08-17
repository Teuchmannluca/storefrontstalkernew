require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkKeepaDataInDB() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  console.log('🔍 Checking Keepa data in database...\n');
  
  // Check products table for Keepa columns
  console.log('📦 Products with Keepa data:');
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('asin, product_name, keepa_estimated_sales, keepa_sales_drops_30d, keepa_sales_drops_90d, keepa_competitor_count, keepa_last_updated')
    .not('keepa_last_updated', 'is', null)
    .limit(5);
  
  if (productsError) {
    console.error('Error fetching products:', productsError);
  } else if (products && products.length > 0) {
    products.forEach(p => {
      console.log(`\n  ASIN: ${p.asin}`);
      console.log(`  Product: ${p.product_name || 'Unknown'}`);
      console.log(`  Keepa Est. Sales: ${p.keepa_estimated_sales || 0}/month`);
      console.log(`  Sales Drops: 30d=${p.keepa_sales_drops_30d || 0}, 90d=${p.keepa_sales_drops_90d || 0}`);
      console.log(`  Competitors: ${p.keepa_competitor_count || 0}`);
      console.log(`  Last Updated: ${p.keepa_last_updated}`);
    });
  } else {
    console.log('  No products with Keepa data found');
  }
  
  // Check recent arbitrage opportunities
  console.log('\n\n📊 Recent Arbitrage Opportunities with Keepa data:');
  const { data: opportunities, error: oppsError } = await supabase
    .from('arbitrage_opportunities')
    .select('asin, product_name, keepa_sales_data, keepa_graph_url, created_at')
    .not('keepa_sales_data', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (oppsError) {
    console.error('Error fetching opportunities:', oppsError);
  } else if (opportunities && opportunities.length > 0) {
    opportunities.forEach(opp => {
      console.log(`\n  ASIN: ${opp.asin}`);
      console.log(`  Product: ${opp.product_name || 'Unknown'}`);
      if (opp.keepa_sales_data) {
        const kd = opp.keepa_sales_data;
        console.log(`  Keepa Sales: ${kd.estimatedMonthlySales || 0}/month`);
        console.log(`  Sales Drops: 30d=${kd.salesDrops30d || 0}, 90d=${kd.salesDrops90d || 0}`);
        console.log(`  Competitors: ${kd.competitorCount || 0}`);
        console.log(`  Buy Box Win: ${kd.buyBoxWinRate ? kd.buyBoxWinRate.toFixed(1) + '%' : 'N/A'}`);
      }
      console.log(`  Graph URL: ${opp.keepa_graph_url ? '✅ Available' : '❌ Not available'}`);
      console.log(`  Created: ${opp.created_at}`);
    });
  } else {
    console.log('  No opportunities with Keepa data found');
  }
  
  // Check if there are any recent scans
  console.log('\n\n📋 Recent Scans:');
  const { data: scans, error: scansError } = await supabase
    .from('arbitrage_scans')
    .select('id, scan_type, storefront_name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (scansError) {
    console.error('Error fetching scans:', scansError);
  } else if (scans && scans.length > 0) {
    scans.forEach(scan => {
      console.log(`\n  Scan ID: ${scan.id}`);
      console.log(`  Type: ${scan.scan_type}`);
      console.log(`  Storefront: ${scan.storefront_name}`);
      console.log(`  Status: ${scan.status}`);
      console.log(`  Created: ${scan.created_at}`);
    });
  } else {
    console.log('  No recent scans found');
  }
}

checkKeepaDataInDB().catch(console.error);