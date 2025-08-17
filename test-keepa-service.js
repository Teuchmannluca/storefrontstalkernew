require('dotenv').config({ path: '.env.local' });

async function testKeepaService() {
  console.log('🧪 Testing Keepa Service Integration\n');
  
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    console.error('❌ KEEPA_API_KEY not found in .env.local');
    return;
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 10) + '...');
  
  // Test the service directly
  try {
    // Import the service (we'll use dynamic import for ES modules)
    console.log('\n📦 Testing with ASIN: B08TLSB2XD (from your screenshot)\n');
    
    // Test with axios directly first
    const axios = require('axios');
    
    const response = await axios.get('https://api.keepa.com/product', {
      params: {
        key: apiKey,
        domain: 2, // UK
        asin: 'B08TLSB2XD',
        stats: 90,
        offers: 20,
        buybox: 1,
        history: 0
      }
    });
    
    console.log('API Response received:', {
      hasProducts: !!(response.data && response.data.products),
      productCount: response.data?.products?.length || 0,
      tokensLeft: response.data?.tokensLeft
    });
    
    if (response.data && response.data.products && response.data.products.length > 0) {
      const product = response.data.products[0];
      const stats = product.stats || {};
      
      console.log('\n📊 Product Data:');
      console.log('  Title:', product.title || 'Not found');
      console.log('  Brand:', product.brand || 'Not found');
      console.log('  ASIN:', product.asin);
      
      console.log('\n📈 Sales Statistics:');
      console.log('  Sales Drops (30d):', stats.salesRankDrops30 || 'No data');
      console.log('  Sales Drops (90d):', stats.salesRankDrops90 || 'No data');
      
      if (stats.salesRankDrops90 && stats.salesRankDrops90 > 0) {
        console.log('  Estimated Monthly Sales:', Math.round(stats.salesRankDrops90 / 3));
      } else {
        console.log('  Estimated Monthly Sales: No data');
      }
      
      // Check Buy Box data
      if (stats.buyBoxStats) {
        const competitors = Object.keys(stats.buyBoxStats).length;
        console.log('  Competitors:', competitors);
      }
      
      // Check current offers
      if (product.offers) {
        console.log('  Current Offers:', product.offers.length);
      }
      
      // Generate graph URL
      const graphUrl = `https://graph.keepa.com/pricehistory.png?asin=B08TLSB2XD&domain=2&width=500&height=200&range=90&amazon=1&new=1&salesrank=1&buybox=1&key=${apiKey}`;
      console.log('\n📊 Graph URL:', graphUrl);
      
    } else {
      console.log('⚠️  No product data returned for this ASIN');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testKeepaService();