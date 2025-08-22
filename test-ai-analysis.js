const axios = require('axios');
require('dotenv').config();

/**
 * Test script for AI Deal Analysis System
 * Tests the comprehensive AI analysis on sample ASINs
 */

const API_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_USER_TOKEN; // You'll need to set this

// Sample ASINs for testing (mix of different product types and conditions)
const TEST_ASINS = [
  'B07XJ8C8F7', // Electronics - typically good sales
  'B08N5WRWNW', // Home & Garden
  'B0BDHB9Y8T', // Fashion/Accessories
  'B09X67JPHZ', // Books
  'B07VWHSQYK', // Sports & Outdoors
];

// Test scenarios
const TEST_SCENARIOS = [
  {
    name: 'Single ASIN Analysis',
    endpoint: '/api/ai/analyze-deal',
    method: 'POST',
    data: { asin: TEST_ASINS[0], includeHistoricalData: true }
  },
  {
    name: 'Quick Score Check',
    endpoint: `/api/ai/quick-score/${TEST_ASINS[0]}`,
    method: 'GET'
  },
  {
    name: 'Comprehensive Insights',
    endpoint: `/api/ai/insights/${TEST_ASINS[0]}`,
    method: 'GET'
  },
  {
    name: 'Batch Analysis',
    endpoint: '/api/ai/batch-analyze',
    method: 'POST',
    data: { 
      asins: TEST_ASINS.slice(0, 3), 
      includeHistoricalData: false,
      maxConcurrent: 2
    }
  },
  {
    name: 'Arbitrage with AI Analysis',
    endpoint: '/api/arbitrage/analyze-asins-stream',
    method: 'POST',
    data: { 
      asins: [TEST_ASINS[0]], 
      includeKeepa: true,
      includeAIAnalysis: true
    }
  }
];

async function testScenario(scenario) {
  console.log(`\n🧪 Testing: ${scenario.name}`);
  console.log(`📍 ${scenario.method} ${scenario.endpoint}`);
  
  try {
    const startTime = Date.now();
    
    const config = {
      method: scenario.method,
      url: `${API_BASE}${scenario.endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    };
    
    if (scenario.data) {
      config.data = scenario.data;
    }
    
    const response = await axios(config);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Success (${duration}ms)`);
    console.log(`📊 Status: ${response.status}`);
    
    if (response.data) {
      // Analyze the response based on the scenario
      if (scenario.name === 'Single ASIN Analysis') {
        const analysis = response.data.data;
        console.log(`🎯 AI Score: ${analysis.aiScore}/1000`);
        console.log(`📈 Deal Type: ${analysis.dealType}`);
        console.log(`🔮 Confidence: ${analysis.confidence}%`);
        console.log(`💡 Top Insight: ${analysis.topInsights?.[0] || 'None'}`);
        console.log(`⚠️ Top Warning: ${analysis.warnings?.[0] || 'None'}`);
        
        // Validate score components
        const totalComponentScore = analysis.salesScore + analysis.priceScore + 
                                   analysis.competitionScore + analysis.opportunityScore + 
                                   (150 - analysis.riskScore); // Risk score is inverted
        const expectedScore = Math.round(totalComponentScore * 1.0); // Adjust for weights
        console.log(`🧮 Score Validation: Calculated=${expectedScore}, Actual=${analysis.aiScore}`);
        
      } else if (scenario.name === 'Quick Score Check') {
        const quickData = response.data.data;
        console.log(`⚡ Quick Score: ${quickData.aiScore}/1000`);
        console.log(`🎯 Classification: ${quickData.dealClassification}`);
        console.log(`💰 Price Position: ${quickData.pricePosition}`);
        console.log(`🏃 Sales Velocity: ${quickData.salesVelocity}`);
        console.log(`🏆 Competition: ${quickData.competitionLevel}`);
        console.log(`⏰ Timing: ${quickData.optimalTiming}`);
        
      } else if (scenario.name === 'Comprehensive Insights') {
        const insights = response.data.data;
        console.log(`📊 Summary Score: ${insights.summary.aiScore}/1000`);
        console.log(`🔬 Data Quality: ${insights.dataQuality.completeness}%`);
        console.log(`📈 Market Intelligence:`);
        console.log(`   💰 Current Price: £${insights.marketIntelligence.pricing.current || 'N/A'}`);
        console.log(`   📊 Sales/Month: ${insights.marketIntelligence.sales.monthly || 'N/A'}`);
        console.log(`   🏪 FBA Competitors: ${insights.marketIntelligence.competition.fba || 'N/A'}`);
        console.log(`💡 Action Items: ${insights.actionItems.length}`);
        
      } else if (scenario.name === 'Batch Analysis') {
        const batchData = response.data.data;
        console.log(`📦 Batch Summary:`);
        console.log(`   📊 Total: ${batchData.total}`);
        console.log(`   🆕 New Analyses: ${batchData.analyzed}`);
        console.log(`   💾 From Cache: ${batchData.fromCache}`);
        console.log(`   ❌ Errors: ${batchData.errors.length}`);
        console.log(`   🎯 Avg Score: ${response.data.summary.avgScore}/1000`);
        console.log(`   🔥 Top Deals (≥700): ${response.data.summary.topDeals}`);
        console.log(`   👍 Good Deals (500-699): ${response.data.summary.goodDeals}`);
        
      } else if (scenario.name === 'Arbitrage with AI Analysis') {
        // This is a streaming endpoint, so we'll just check the response structure
        console.log(`🌊 Stream Response Structure: ${Object.keys(response.data).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Failed`);
    if (error.response) {
      console.log(`📍 Status: ${error.response.status}`);
      console.log(`📝 Error: ${error.response.data.error || error.response.statusText}`);
      if (error.response.data.details) {
        console.log(`🔍 Details: ${error.response.data.details}`);
      }
    } else {
      console.log(`🔍 Error: ${error.message}`);
    }
  }
}

async function runAccuracyTests() {
  console.log('🚀 Starting AI Deal Analysis Tests');
  console.log(`🌐 API Base: ${API_BASE}`);
  console.log(`🔑 Auth Token: ${TEST_TOKEN ? 'Set' : 'Missing - tests may fail'}`);
  
  if (!TEST_TOKEN) {
    console.log('\n⚠️  Warning: TEST_USER_TOKEN not set. Please set this environment variable.');
    console.log('   You can get a token by logging into your app and checking the browser dev tools.');
    return;
  }
  
  // Test each scenario
  for (const scenario of TEST_SCENARIOS) {
    await testScenario(scenario);
    
    // Rate limiting between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🎉 All tests completed!');
  
  // Additional validation tests
  console.log('\n🔍 Running Validation Tests...');
  
  try {
    // Test score consistency
    console.log('\n📊 Testing Score Consistency...');
    const analysis1 = await axios.post(`${API_BASE}/api/ai/analyze-deal`, {
      asin: TEST_ASINS[0],
      includeHistoricalData: false
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const analysis2 = await axios.post(`${API_BASE}/api/ai/analyze-deal`, {
      asin: TEST_ASINS[0],
      includeHistoricalData: false,
      forceRefresh: true
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const score1 = analysis1.data.data.aiScore;
    const score2 = analysis2.data.data.aiScore;
    const scoreDifference = Math.abs(score1 - score2);
    
    console.log(`📈 First Analysis Score: ${score1}`);
    console.log(`📈 Second Analysis Score: ${score2}`);
    console.log(`📊 Score Difference: ${scoreDifference}`);
    
    if (scoreDifference <= 50) { // Allow for small variations due to timing
      console.log('✅ Score consistency test passed');
    } else {
      console.log('⚠️  Score consistency test: Significant variation detected');
    }
    
  } catch (error) {
    console.log('❌ Score consistency test failed:', error.message);
  }
  
  console.log('\n🏁 Validation tests completed!');
  
  // Performance summary
  console.log('\n📈 Performance Summary:');
  console.log('• Single ASIN analysis should complete in 5-15 seconds');
  console.log('• Quick score should be instant (cached)');
  console.log('• Batch analysis scales with ASIN count');
  console.log('• AI scores should be consistent for same ASIN');
  console.log('• High-scoring deals (>700) should have clear positive indicators');
  console.log('• Low-scoring deals (<300) should have clear risk factors');
}

// Run the tests
if (require.main === module) {
  runAccuracyTests().catch(console.error);
}

module.exports = { runAccuracyTests, testScenario, TEST_ASINS };