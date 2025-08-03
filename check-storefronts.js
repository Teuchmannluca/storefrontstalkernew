// Check if user has storefronts in database
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkStorefronts() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get all storefronts
    const { data: storefronts, error } = await supabase
      .from('storefronts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching storefronts:', error);
      return;
    }

    console.log(`📊 Found ${storefronts?.length || 0} storefronts in database:`);
    
    if (storefronts && storefronts.length > 0) {
      storefronts.forEach((storefront, index) => {
        console.log(`${index + 1}. ${storefront.name} (${storefront.seller_id}) - User: ${storefront.user_id}`);
      });
    } else {
      console.log('ℹ️ No storefronts found. You need to add some storefronts first.');
    }

    // Check update queue
    const { data: queueItems, error: queueError } = await supabase
      .from('storefront_update_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (queueError) {
      console.error('❌ Error fetching queue:', queueError);
    } else {
      console.log(`\n🔄 Found ${queueItems?.length || 0} items in update queue:`);
      if (queueItems && queueItems.length > 0) {
        queueItems.forEach((item, index) => {
          console.log(`${index + 1}. Storefront: ${item.storefront_id}, Status: ${item.status}, Created: ${item.created_at}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkStorefronts();