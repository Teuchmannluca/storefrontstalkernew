/**
 * AI Deal Scoring Demo - Shows how the scoring system works
 * This demonstrates the AI analysis with sample data
 */

// Import our AI analyzer
const { AIDealAnalyzer } = require('./src/services/ai-deal-analyzer.ts');

// Sample comprehensive Keepa data for different deal types
const SAMPLE_DEALS = {
  excellentDeal: {
    asin: 'B07XJ8C8F7',
    title: 'Premium Wireless Headphones',
    brand: 'TechBrand',
    mainImage: 'https://example.com/image1.jpg',
    category: 'Electronics',
    reviewCount: 2850,
    rating: 4.6,
    
    // Excellent sales metrics
    salesPerMonth: 450,
    salesRank: 2500,
    salesDrops30d: 450,
    salesDrops90d: 1350,
    salesDrops180d: 2700,
    salesDropsAllTime: 15000,
    
    // Great price position (near historic low)
    currentBuyPrice: 18.99,
    buyPrice30d: 21.50,
    buyPrice90d: 24.99,
    buyPrice180d: 28.99,
    buyPrice365d: 32.99,
    avgPriceAllTime: 29.50,
    lowestPriceEver: 17.99,
    highestPriceEver: 45.99,
    
    // Low competition
    totalOfferCount: 8,
    fbaOfferCount: 3,
    fbmOfferCount: 5,
    amazonInStock: false,
    buyBoxWinRate: 85.5,
    
    // Good availability
    outOfStockPercentage30d: 2.1,
    outOfStockPercentage90d: 3.8,
    priceChangeFrequency: 0.8,
    reviewVelocity: 12.5,
    
    // Quality data
    dataCompleteness: 95,
    spmDataSource: 'all_time',
    spmConfidence: 'very_high',
    
    // Mock historical arrays
    priceHistory: [
      { date: new Date('2024-01-01'), price: 32.99 },
      { date: new Date('2024-06-01'), price: 24.99 },
      { date: new Date('2024-08-01'), price: 18.99 }
    ],
    salesRankHistory: [],
    salesRankHistory30d: [],
    competitorHistory: []
  },

  poorDeal: {
    asin: 'B08POOR123',
    title: 'Generic Phone Case',
    brand: 'NoName',
    mainImage: 'https://example.com/image2.jpg',
    category: 'Accessories',
    reviewCount: 45,
    rating: 3.2,
    
    // Poor sales metrics
    salesPerMonth: 8,
    salesRank: 850000,
    salesDrops30d: 8,
    salesDrops90d: 24,
    salesDrops180d: 48,
    salesDropsAllTime: 120,
    
    // Bad price position (near historic high)
    currentBuyPrice: 12.99,
    buyPrice30d: 11.50,
    buyPrice90d: 9.99,
    buyPrice180d: 8.99,
    buyPrice365d: 7.99,
    avgPriceAllTime: 9.50,
    lowestPriceEver: 4.99,
    highestPriceEver: 14.99,
    
    // High competition
    totalOfferCount: 45,
    fbaOfferCount: 28,
    fbmOfferCount: 17,
    amazonInStock: true,
    buyBoxWinRate: 15.2,
    
    // Poor availability
    outOfStockPercentage30d: 25.8,
    outOfStockPercentage90d: 32.1,
    priceChangeFrequency: 4.2,
    reviewVelocity: 0.8,
    
    // Limited data
    dataCompleteness: 65,
    spmDataSource: '30day',
    spmConfidence: 'low',
    
    // Mock historical arrays
    priceHistory: [
      { date: new Date('2024-01-01'), price: 7.99 },
      { date: new Date('2024-06-01'), price: 9.99 },
      { date: new Date('2024-08-01'), price: 12.99 }
    ],
    salesRankHistory: [],
    salesRankHistory30d: [],
    competitorHistory: []
  },

  moderateDeal: {
    asin: 'B09MOD789',
    title: 'Kitchen Gadget Pro',
    brand: 'KitchenCorp',
    mainImage: 'https://example.com/image3.jpg',
    category: 'Home & Kitchen',
    reviewCount: 890,
    rating: 4.2,
    
    // Moderate sales metrics
    salesPerMonth: 120,
    salesRank: 15500,
    salesDrops30d: 120,
    salesDrops90d: 360,
    salesDrops180d: 720,
    salesDropsAllTime: 3500,
    
    // Average price position
    currentBuyPrice: 24.99,
    buyPrice30d: 26.50,
    buyPrice90d: 25.99,
    buyPrice180d: 23.99,
    buyPrice365d: 27.99,
    avgPriceAllTime: 25.50,
    lowestPriceEver: 19.99,
    highestPriceEver: 34.99,
    
    // Moderate competition
    totalOfferCount: 15,
    fbaOfferCount: 9,
    fbmOfferCount: 6,
    amazonInStock: true,
    buyBoxWinRate: 45.8,
    
    // Average availability
    outOfStockPercentage30d: 8.5,
    outOfStockPercentage90d: 12.2,
    priceChangeFrequency: 1.8,
    reviewVelocity: 5.2,
    
    // Good data
    dataCompleteness: 85,
    spmDataSource: '90day',
    smpConfidence: 'high',
    
    // Mock historical arrays
    priceHistory: [
      { date: new Date('2024-01-01'), price: 27.99 },
      { date: new Date('2024-06-01'), price: 25.99 },
      { date: new Date('2024-08-01'), price: 24.99 }
    ],
    salesRankHistory: [],
    salesRankHistory30d: [],
    competitorHistory: []
  }
};

// Sample arbitrage contexts for each deal
const ARBITRAGE_CONTEXTS = {
  excellentDeal: {
    buyPrice: 18.99,
    sellPrice: 32.99,
    profit: 8.50,
    roi: 44.8
  },
  poorDeal: {
    buyPrice: 12.99,
    sellPrice: 15.99,
    profit: 0.85,
    roi: 6.5
  },
  moderateDeal: {
    buyPrice: 24.99,
    sellPrice: 34.99,
    profit: 4.50,
    roi: 18.0
  }
};

async function demonstrateScoring() {
  console.log('🧠 AI Deal Scoring System Demo');
  console.log('═'.repeat(50));
  
  const aiAnalyzer = new AIDealAnalyzer();
  
  for (const [dealType, keepaData] of Object.entries(SAMPLE_DEALS)) {
    const arbitrageData = ARBITRAGE_CONTEXTS[dealType];
    
    console.log(`\n🎯 Analyzing ${dealType.toUpperCase()}:`);
    console.log(`📦 Product: ${keepaData.title}`);
    console.log(`💰 Buy: £${arbitrageData.buyPrice} → Sell: £${arbitrageData.sellPrice}`);
    console.log(`💵 Profit: £${arbitrageData.profit} (${arbitrageData.roi}% ROI)`);
    console.log('─'.repeat(40));
    
    try {
      const analysis = await aiAnalyzer.analyzeComprehensively(keepaData, arbitrageData);
      
      // Overall Score
      console.log(`🎯 AI SCORE: ${analysis.aiScore}/1000 - ${analysis.dealType}`);
      console.log(`🔮 Confidence: ${analysis.confidence}%`);
      
      // Component Breakdown
      console.log('\n📊 SCORE BREAKDOWN:');
      console.log(`   📈 Sales Performance: ${analysis.salesScore}/250 (${Math.round(analysis.salesScore/250*100)}%)`);
      console.log(`   💰 Price Intelligence: ${analysis.priceScore}/250 (${Math.round(analysis.priceScore/250*100)}%)`);
      console.log(`   🏪 Competition Analysis: ${analysis.competitionScore}/200 (${Math.round(analysis.competitionScore/200*100)}%)`);
      console.log(`   🚀 Market Opportunity: ${analysis.opportunityScore}/150 (${Math.round(analysis.opportunityScore/150*100)}%)`);
      console.log(`   ⚠️  Risk Assessment: ${analysis.riskScore}/150 (${analysis.riskScore <= 30 ? 'LOW' : analysis.riskScore <= 75 ? 'MEDIUM' : 'HIGH'} RISK)`);
      
      // Market Position
      console.log('\n🌍 MARKET POSITION:');
      console.log(`   📊 Price Percentile: ${analysis.currentPricePercentile}th (${getPricePositionText(analysis.currentPricePercentile)})`);
      console.log(`   🏃 Sales Velocity: ${analysis.salesVelocityRank} (${keepaData.salesPerMonth}/month)`);
      console.log(`   📈 Price Trend: ${analysis.priceTrend}`);
      console.log(`   📊 Sales Trend: ${analysis.salesTrend}`);
      console.log(`   🏪 Competition Trend: ${analysis.competitionTrend}`);
      
      // AI Insights
      console.log('\n💡 TOP AI INSIGHTS:');
      analysis.topInsights.slice(0, 3).forEach((insight, i) => {
        console.log(`   ${i + 1}. ${insight}`);
      });
      
      if (analysis.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        analysis.warnings.slice(0, 2).forEach((warning, i) => {
          console.log(`   ${i + 1}. ${warning}`);
        });
      }
      
      if (analysis.opportunities.length > 0) {
        console.log('\n🎯 OPPORTUNITIES:');
        analysis.opportunities.slice(0, 2).forEach((opportunity, i) => {
          console.log(`   ${i + 1}. ${opportunity}`);
        });
      }
      
      // Predictions
      console.log('\n🔮 AI PREDICTIONS:');
      console.log(`   💰 30-day Price: £${analysis.predictedPriceIn30Days?.toFixed(2) || 'N/A'}`);
      console.log(`   📊 30-day Sales: ${analysis.predictedSalesIn30Days || 'N/A'}/month`);
      console.log(`   ⏰ Optimal Timing: ${analysis.optimalBuyingWindow}`);
      
      // Final Recommendation
      console.log('\n🎯 RECOMMENDATION:');
      console.log(`   ${getRecommendationEmoji(analysis.aiScore)} ${getRecommendationText(analysis.aiScore, analysis.dealType)}`);
      
    } catch (error) {
      console.log(`❌ Error analyzing ${dealType}:`, error.message);
    }
    
    console.log('\n' + '═'.repeat(50));
  }
  
  // Show scoring methodology
  console.log('\n📚 SCORING METHODOLOGY:');
  console.log('• Sales Performance (250 pts): Monthly sales, rank, consistency');
  console.log('• Price Intelligence (250 pts): Historical position, trends, volatility');
  console.log('• Competition Analysis (200 pts): FBA count, Amazon presence, buy box');
  console.log('• Market Opportunity (150 pts): ROI potential, market size, growth');
  console.log('• Risk Assessment (150 pts): Volatility, stock issues, competition surge');
  console.log('\nSCORE RANGES:');
  console.log('• 850-1000: 🔥 INSTANT_BUY - Exceptional opportunity');
  console.log('• 750-849:  ⭐ STRONG_OPPORTUNITY - Excellent fundamentals');
  console.log('• 600-749:  👍 GOOD_DEAL - Solid opportunity');
  console.log('• 450-599:  ⚠️  MODERATE - Mixed signals');
  console.log('• 300-449:  ⏳ WAIT - Better opportunities ahead');
  console.log('• 0-299:    ❌ AVOID - Poor fundamentals');
}

function getPricePositionText(percentile) {
  if (percentile <= 20) return 'Near Historic Low';
  if (percentile <= 40) return 'Below Average';
  if (percentile <= 60) return 'Average Price';
  if (percentile <= 80) return 'Above Average';
  return 'Near Historic High';
}

function getRecommendationEmoji(score) {
  if (score >= 850) return '🔥';
  if (score >= 750) return '⭐';
  if (score >= 600) return '👍';
  if (score >= 450) return '⚠️';
  if (score >= 300) return '⏳';
  return '❌';
}

function getRecommendationText(score, dealType) {
  const messages = {
    'INSTANT_BUY': 'Exceptional opportunity - act immediately!',
    'STRONG_OPPORTUNITY': 'Strong buy signal - excellent entry point',
    'GOOD_DEAL': 'Solid opportunity - worth considering',
    'MODERATE': 'Mixed signals - analyze carefully',
    'WAIT': 'Better opportunities likely ahead',
    'AVOID': 'Poor fundamentals - skip this deal'
  };
  return messages[dealType] || 'Unknown deal type';
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { demonstrateScoring, SAMPLE_DEALS, ARBITRAGE_CONTEXTS };
}

// Run demo if called directly
if (require.main === module) {
  demonstrateScoring().catch(console.error);
}