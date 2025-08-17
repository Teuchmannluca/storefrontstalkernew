require('dotenv').config({ path: '.env.local' });

// Test the Keepa integration
async function testKeepaIntegration() {
  const apiKey = process.env.KEEPA_API_KEY;
  
  if (!apiKey) {
    console.error('❌ KEEPA_API_KEY not found in .env.local');
    process.exit(1);
  }
  
  console.log('✅ Keepa API key found');
  
  // Test ASINs
  const testAsins = ['B09B8V1QH5', 'B08N5WRWNW']; // Echo Dot examples
  
  console.log('\n📊 Testing Keepa API integration...');
  console.log('ASINs to test:', testAsins.join(', '));
  
  try {
    // Test the API endpoint
    const response = await fetch('http://localhost:3000/api/arbitrage/analyze-asins-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // You'll need a valid auth token from Supabase
        'Authorization': 'Bearer YOUR_AUTH_TOKEN' // Replace with actual token
      },
      body: JSON.stringify({
        asins: testAsins
      })
    });
    
    if (!response.ok) {
      console.error('❌ API request failed:', response.status, response.statusText);
      return;
    }
    
    // Read the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    console.log('\n📡 Streaming results...\n');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const message = JSON.parse(line.slice(6));
            
            if (message.type === 'progress') {
              console.log(`⏳ ${message.data.step}`);
            } else if (message.type === 'opportunity') {
              const opp = message.data;
              console.log('\n✅ Opportunity found:');
              console.log(`  ASIN: ${opp.asin}`);
              console.log(`  Product: ${opp.productName}`);
              
              if (opp.keepaSalesData) {
                console.log('\n  📊 Keepa Data:');
                console.log(`    - Sales (30d drops): ${opp.keepaSalesData.salesDrops30d}`);
                console.log(`    - Sales (90d drops): ${opp.keepaSalesData.salesDrops90d}`);
                console.log(`    - Est. Monthly Sales: ${opp.keepaSalesData.estimatedMonthlySales}`);
                console.log(`    - Competitors: ${opp.keepaSalesData.competitorCount}`);
                if (opp.keepaSalesData.buyBoxWinRate) {
                  console.log(`    - Buy Box Win Rate: ${opp.keepaSalesData.buyBoxWinRate.toFixed(1)}%`);
                }
              }
              
              if (opp.keepaGraphUrl) {
                console.log(`  📈 Graph URL: ${opp.keepaGraphUrl}`);
              }
            } else if (message.type === 'complete') {
              console.log('\n✅ Analysis complete!');
              console.log(`  Total opportunities: ${message.data.opportunitiesFound}`);
            } else if (message.type === 'error') {
              console.error('❌ Error:', message.data.error);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Note about authentication
console.log('⚠️  Note: This test requires a valid Supabase auth token.');
console.log('To get a token:');
console.log('1. Log into the app at http://localhost:3000');
console.log('2. Open browser console and run:');
console.log('   (await supabase.auth.getSession()).data.session.access_token');
console.log('3. Replace YOUR_AUTH_TOKEN in this script with the actual token\n');

// Uncomment to run the test after setting up auth token
// testKeepaIntegration();

// Alternative: Test just the Keepa API directly
async function testKeepaApiDirect() {
  const axios = require('axios');
  const apiKey = process.env.KEEPA_API_KEY;
  
  if (!apiKey) {
    console.error('❌ KEEPA_API_KEY not found');
    return;
  }
  
  console.log('\n🔍 Testing Keepa API directly...');
  
  try {
    const response = await axios.get('https://api.keepa.com/product', {
      params: {
        key: apiKey,
        domain: 2, // UK
        asin: 'B09B8V1QH5',
        stats: 90,
        offers: 20,
        buybox: 1
      }
    });
    
    if (response.data && response.data.products && response.data.products.length > 0) {
      const product = response.data.products[0];
      const stats = product.stats || {};
      
      console.log('✅ Keepa API working!');
      console.log(`  Product: ${product.title || 'Unknown'}`);
      console.log(`  Sales Drops (30d): ${stats.salesRankDrops30 || 0}`);
      console.log(`  Sales Drops (90d): ${stats.salesRankDrops90 || 0}`);
      console.log(`  Estimated Monthly Sales: ${Math.round((stats.salesRankDrops90 || 0) / 3)}`);
      console.log(`  Tokens remaining: ${response.data.tokensLeft || 'Unknown'}`);
      
      // Generate graph URL
      const graphUrl = `https://graph.keepa.com/pricehistory.png?asin=B09B8V1QH5&domain=2&width=500&height=200&range=90&amazon=1&new=1&salesrank=1&buybox=1&key=${apiKey}`;
      console.log(`  Graph URL: ${graphUrl}`);
    } else {
      console.log('⚠️  No product data returned');
    }
  } catch (error) {
    console.error('❌ Keepa API error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the direct API test
testKeepaApiDirect();