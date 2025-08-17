const axios = require('axios');

async function testKeepaApiDirect() {
  const apiKey = 'j01b0215fa9e0fld85jteld46mq978dqe8gqj4ohvjmp39m26kcr1ooaovdgb4cv';
  
  console.log('🔍 Testing Keepa API with popular ASINs...\n');
  
  // Test with multiple ASINs
  const testAsins = [
    'B084DWG2VQ', // Echo Dot 4th Gen
    'B08H95Y452', // Echo Dot 4th Gen with clock
    'B07V6ZSHF4'  // Echo Show 5
  ];
  
  for (const asin of testAsins) {
    console.log(`\n📦 Testing ASIN: ${asin}`);
    console.log('=' .repeat(50));
    
    try {
      const response = await axios.get('https://api.keepa.com/product', {
        params: {
          key: apiKey,
          domain: 2, // UK
          asin: asin,
          stats: 90,
          offers: 20,
          buybox: 1,
          history: 0
        }
      });
      
      if (response.data && response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        const stats = product.stats || {};
        
        console.log('✅ Product Found:');
        console.log(`  Title: ${product.title || 'Unknown'}`);
        console.log(`  Brand: ${product.brand || 'Unknown'}`);
        
        console.log('\n📊 Sales Statistics:');
        console.log(`  Sales Drops (30d): ${stats.salesRankDrops30 || 0}`);
        console.log(`  Sales Drops (90d): ${stats.salesRankDrops90 || 0}`);
        
        const estimatedMonthlySales = stats.salesRankDrops90 && stats.salesRankDrops90 > 0 
          ? Math.round(stats.salesRankDrops90 / 3) 
          : 0;
        console.log(`  Estimated Monthly Sales: ${estimatedMonthlySales}`);
        
        // Sales rank
        if (product.salesRanks) {
          const ranks = Object.entries(product.salesRanks);
          if (ranks.length > 0) {
            console.log(`  Current Sales Rank: #${ranks[0][1]}`);
          }
        }
        
        console.log('\n💰 Pricing Data:');
        if (stats.current && stats.current[1] !== -1) {
          console.log(`  Current Price: £${(stats.current[1] / 100).toFixed(2)}`);
        }
        
        if (stats.avg30 && stats.avg30[1] !== -1) {
          console.log(`  Avg Price (30d): £${(stats.avg30[1] / 100).toFixed(2)}`);
        }
        
        if (stats.min30 && stats.min30[1] !== -1 && stats.max30 && stats.max30[1] !== -1) {
          console.log(`  Price Range (30d): £${(stats.min30[1] / 100).toFixed(2)} - £${(stats.max30[1] / 100).toFixed(2)}`);
        }
        
        // Buy Box competition
        if (stats.buyBoxStats) {
          const competitorCount = Object.keys(stats.buyBoxStats).length;
          console.log(`\n🏆 Buy Box Competition:`);
          console.log(`  Competitors: ${competitorCount}`);
          
          // Find dominant seller
          let maxWinRate = 0;
          for (const [sellerId, sellerStats] of Object.entries(stats.buyBoxStats)) {
            if (sellerStats.percentageWon > maxWinRate) {
              maxWinRate = sellerStats.percentageWon;
            }
          }
          if (maxWinRate > 0) {
            console.log(`  Top Seller Win Rate: ${maxWinRate.toFixed(1)}%`);
          }
        }
        
        // Current offers
        if (product.offers && product.offers.length > 0) {
          console.log(`\n📦 Current Offers: ${product.offers.length} active sellers`);
        }
        
        // Out of stock percentage
        if (stats.outOfStockPercentage30 !== undefined) {
          console.log(`\n📉 Out of Stock: ${stats.outOfStockPercentage30.toFixed(1)}% of time (30 days)`);
        }
        
        // Generate graph URL
        const graphUrl = `https://graph.keepa.com/pricehistory.png?asin=${asin}&domain=2&width=500&height=200&range=90&amazon=1&new=1&salesrank=1&buybox=1&key=${apiKey}`;
        console.log(`\n📈 Graph URL: ${graphUrl}`);
        
      } else {
        console.log('⚠️  No product data returned');
      }
      
      console.log(`\n💳 Tokens remaining: ${response.data.tokensLeft || 'Unknown'}`);
      
    } catch (error) {
      console.error(`❌ Error for ASIN ${asin}:`, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Keepa API test complete!');
}

// Run the test
testKeepaApiDirect();