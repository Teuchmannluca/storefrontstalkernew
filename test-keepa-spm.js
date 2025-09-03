#!/usr/bin/env node

/**
 * Test script to verify Keepa SPM integration in ASIN Checker
 * This script will test a few popular ASINs to see if Keepa data is fetched
 */

const testASINs = [
  'B0BKFGQP87', // Popular product - should have sales data
  'B08N5WRWNW', // Amazon Echo Dot
  'B0C7P7N7Q4', // Another popular item
];

async function testKeepaIntegration() {
  console.log('🧪 Testing Keepa SPM Integration for ASIN Checker');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch('http://localhost:3000/api/arbitrage/analyze-asins-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // You'll need a real auth token
      },
      body: JSON.stringify({
        asins: testASINs,
        includeKeepa: true,
        includeAIAnalysis: false // Keep it simple for testing
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let keepaDataFound = 0;
    let totalOpportunities = 0;

    console.log('📡 Streaming response...\n');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const message = JSON.parse(line.slice(6));
            
            switch (message.type) {
              case 'progress':
                console.log(`📊 Progress: ${message.data.step}`);
                if (message.data.keepaStatus) {
                  console.log(`🔍 Keepa Status: ${message.data.keepaStatus} - ${message.data.keepaReason || 'No reason provided'}`);
                }
                if (message.data.keepaTokens) {
                  console.log(`🪙 Keepa Tokens: ${message.data.keepaTokens.available} available, ${message.data.keepaTokens.needed} needed`);
                }
                break;
                
              case 'opportunity':
                totalOpportunities++;
                const opp = message.data;
                
                console.log(`\n📦 ASIN: ${opp.asin}`);
                console.log(`   Product: ${opp.productName}`);
                console.log(`   UK Price: £${opp.targetPrice}`);
                
                if (opp.keepaSalesData) {
                  keepaDataFound++;
                  console.log(`   ✅ Keepa SPM: ${opp.keepaSalesData.estimatedMonthlySales}/month`);
                  console.log(`   📊 Source: ${opp.keepaSalesData.spmDataSource} (confidence: ${opp.keepaSalesData.spmConfidence})`);
                  console.log(`   📈 Sales Drops: 30d=${opp.keepaSalesData.salesDrops30d}, 90d=${opp.keepaSalesData.salesDrops90d}`);
                  console.log(`   🏆 Competitors: ${opp.keepaSalesData.competitorCount}`);
                } else {
                  console.log(`   ❌ No Keepa SPM data - using BSR estimate: ${opp.salesPerMonth || 0}/month`);
                }
                break;
                
              case 'complete':
                console.log(`\n✅ Analysis complete: ${message.data.opportunitiesFound} opportunities found`);
                break;
                
              case 'error':
                console.error(`❌ Error: ${message.data.error}`);
                break;
            }
          } catch (parseError) {
            // Skip parsing errors
          }
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Results:');
    console.log(`   Total opportunities: ${totalOpportunities}`);
    console.log(`   ASINs with Keepa data: ${keepaDataFound}`);
    console.log(`   Success rate: ${totalOpportunities > 0 ? Math.round((keepaDataFound / totalOpportunities) * 100) : 0}%`);
    
    if (keepaDataFound === 0) {
      console.log('\n⚠️  No Keepa SPM data was fetched. Check the debug logs in the console for detailed information.');
      console.log('   Common issues:');
      console.log('   1. KEEPA_API_KEY not configured');
      console.log('   2. Insufficient Keepa tokens');
      console.log('   3. ASINs not available in Keepa UK database');
      console.log('   4. API rate limiting or service errors');
    } else {
      console.log('\n🎉 Keepa SPM integration is working!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   1. The development server is running (npm run dev)');
    console.log('   2. You have valid authentication credentials');
    console.log('   3. The KEEPA_API_KEY is configured in .env.local');
  }
}

// Run the test
testKeepaIntegration().catch(console.error);