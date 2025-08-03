// Reset token tracker to give more starting tokens
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function resetTokens() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Delete existing token tracker to force recreation with new values
    const { error: deleteError } = await supabase
      .from('keepa_token_tracker')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error deleting old token tracker:', deleteError);
    } else {
      console.log('✅ Reset token tracker - will be recreated with 200 tokens on next API call');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetTokens();