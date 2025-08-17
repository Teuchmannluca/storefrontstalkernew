require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function fixKeepaData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  console.log('🔧 Fixing Keepa data structure in database...\n');
  
  // Get the record with the problematic data
  const { data: records, error: fetchError } = await supabase
    .from('arbitrage_opportunities')
    .select('id, asin, keepa_sales_data')
    .not('keepa_sales_data', 'is', null);
  
  if (fetchError) {
    console.error('Error fetching records:', fetchError);
    return;
  }
  
  console.log(`Found ${records.length} records with Keepa data`);
  
  for (const record of records) {
    if (record.keepa_sales_data) {
      let needsUpdate = false;
      const cleanedData = { ...record.keepa_sales_data };
      
      // Fix salesRank if it's an array
      if (Array.isArray(cleanedData.salesRank)) {
        cleanedData.salesRank = cleanedData.salesRank[0] || null;
        needsUpdate = true;
      }
      
      // Fix outOfStockPercentage if it's an array
      if (Array.isArray(cleanedData.outOfStockPercentage)) {
        const validValues = cleanedData.outOfStockPercentage.filter(v => v >= 0 && v <= 100);
        if (validValues.length > 0) {
          cleanedData.outOfStockPercentage = Math.round(
            validValues.reduce((a, b) => a + b, 0) / validValues.length
          );
        } else {
          cleanedData.outOfStockPercentage = null;
        }
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log(`\nUpdating ASIN ${record.asin}:`);
        console.log('  - Fixed salesRank:', cleanedData.salesRank);
        console.log('  - Fixed outOfStockPercentage:', cleanedData.outOfStockPercentage);
        
        const { error: updateError } = await supabase
          .from('arbitrage_opportunities')
          .update({ keepa_sales_data: cleanedData })
          .eq('id', record.id);
        
        if (updateError) {
          console.error(`  ❌ Error updating record:`, updateError);
        } else {
          console.log(`  ✅ Updated successfully`);
        }
      }
    }
  }
  
  console.log('\n✅ Done!');
}

fixKeepaData().catch(console.error);