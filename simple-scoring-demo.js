/**
 * Simple AI Deal Scoring Demo
 * Shows how different deals get scored by the AI system
 */

// Simplified AI scoring logic to demonstrate the concept
class SimpleDealScorer {
  
  analyzeDeal(keepaData, arbitrageData) {
    let totalScore = 0;
    const breakdown = {};
    const insights = [];
    const warnings = [];
    
    // 1. SALES PERFORMANCE SCORE (0-250 points)
    let salesScore = 0;
    const monthlySales = keepaData.salesPerMonth || 0;
    
    if (monthlySales >= 500) {
      salesScore = 250;
      insights.push(`🚀 Excellent sales velocity: ${monthlySales}/month`);
    } else if (monthlySales >= 200) {
      salesScore = 200;
      insights.push(`💪 Strong sales: ${monthlySales}/month`);
    } else if (monthlySales >= 100) {
      salesScore = 150;
      insights.push(`👍 Good sales: ${monthlySales}/month`);
    } else if (monthlySales >= 50) {
      salesScore = 100;
      insights.push(`📊 Moderate sales: ${monthlySales}/month`);
    } else if (monthlySales >= 20) {
      salesScore = 50;
      warnings.push(`⚠️ Low sales volume: ${monthlySales}/month`);
    } else {
      salesScore = 10;
      warnings.push(`❌ Very low sales: ${monthlySales}/month`);
    }
    
    // Sales rank bonus
    if (keepaData.salesRank <= 10000) salesScore += 50;
    else if (keepaData.salesRank <= 50000) salesScore += 30;
    else if (keepaData.salesRank <= 100000) salesScore += 10;
    
    breakdown.salesScore = Math.min(250, salesScore);
    
    // 2. PRICE INTELLIGENCE SCORE (0-250 points)
    let priceScore = 0;
    const currentPrice = keepaData.currentBuyPrice || 0;
    const lowestEver = keepaData.lowestPriceEver || currentPrice;
    const highestEver = keepaData.highestPriceEver || currentPrice;
    
    // Calculate price percentile
    let pricePercentile = 50;
    if (highestEver > lowestEver) {
      pricePercentile = ((currentPrice - lowestEver) / (highestEver - lowestEver)) * 100;
    }
    
    // Price position scoring
    if (pricePercentile <= 20) {
      priceScore = 250;
      insights.push(`💰 Excellent price: ${Math.round(pricePercentile)}th percentile (near historic low)`);
    } else if (pricePercentile <= 40) {
      priceScore = 200;
      insights.push(`💵 Good price: ${Math.round(pricePercentile)}th percentile`);
    } else if (pricePercentile <= 60) {
      priceScore = 150;
      insights.push(`📊 Average price: ${Math.round(pricePercentile)}th percentile`);
    } else if (pricePercentile <= 80) {
      priceScore = 100;
      warnings.push(`⚠️ Above average price: ${Math.round(pricePercentile)}th percentile`);
    } else {
      priceScore = 50;
      warnings.push(`❌ High price: ${Math.round(pricePercentile)}th percentile (near historic high)`);
    }
    
    breakdown.priceScore = priceScore;
    breakdown.pricePercentile = Math.round(pricePercentile);
    
    // 3. COMPETITION ANALYSIS SCORE (0-200 points)
    let competitionScore = 0;
    const fbaCount = keepaData.fbaOfferCount || 0;
    
    if (fbaCount <= 2) {
      competitionScore = 200;
      insights.push(`🎯 Excellent: Only ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 5) {
      competitionScore = 160;
      insights.push(`👍 Good: ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 10) {
      competitionScore = 120;
      insights.push(`📊 Moderate: ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 20) {
      competitionScore = 60;
      warnings.push(`⚠️ High competition: ${fbaCount} FBA competitors`);
    } else {
      competitionScore = 20;
      warnings.push(`❌ Saturated: ${fbaCount} FBA competitors`);
    }
    
    // Amazon presence penalty
    if (!keepaData.amazonInStock) {
      competitionScore += 50;
      insights.push(`🏪 Amazon not in stock - reduced competition`);
    } else {
      warnings.push(`🏪 Amazon is in stock - strong competition`);
    }
    
    breakdown.competitionScore = Math.min(200, competitionScore);
    
    // 4. MARKET OPPORTUNITY SCORE (0-150 points)
    let opportunityScore = 0;
    
    if (arbitrageData) {
      const roi = arbitrageData.roi || 0;
      if (roi >= 50) {
        opportunityScore = 150;
        insights.push(`🚀 Excellent ROI: ${roi.toFixed(1)}%`);
      } else if (roi >= 30) {
        opportunityScore = 120;
        insights.push(`💪 Strong ROI: ${roi.toFixed(1)}%`);
      } else if (roi >= 20) {
        opportunityScore = 90;
        insights.push(`👍 Good ROI: ${roi.toFixed(1)}%`);
      } else if (roi >= 10) {
        opportunityScore = 60;
        insights.push(`📊 Moderate ROI: ${roi.toFixed(1)}%`);
      } else {
        opportunityScore = 30;
        warnings.push(`⚠️ Low ROI: ${roi.toFixed(1)}%`);
      }
    }
    
    breakdown.opportunityScore = opportunityScore;
    
    // 5. RISK ASSESSMENT SCORE (0-150 points, lower risk = higher score)
    let riskScore = 0;
    
    // High competition risk
    if (fbaCount > 20) riskScore += 40;
    else if (fbaCount > 10) riskScore += 20;
    
    // Price volatility risk
    if (pricePercentile > 80) riskScore += 40;
    else if (pricePercentile > 60) riskScore += 20;
    
    // Out of stock risk
    const outOfStock = keepaData.outOfStockPercentage30d || 0;
    if (outOfStock > 20) {
      riskScore += 30;
      warnings.push(`⚠️ High out-of-stock rate: ${outOfStock.toFixed(1)}%`);
    } else if (outOfStock > 10) {
      riskScore += 15;
    }
    
    const adjustedRiskScore = 150 - Math.min(150, riskScore);
    breakdown.riskScore = riskScore;
    breakdown.adjustedRiskScore = adjustedRiskScore;
    
    // CALCULATE TOTAL SCORE
    totalScore = breakdown.salesScore + breakdown.priceScore + breakdown.competitionScore + 
                breakdown.opportunityScore + adjustedRiskScore;
    
    // DETERMINE DEAL CLASSIFICATION
    let dealType;
    if (totalScore >= 850 && riskScore <= 30) dealType = 'INSTANT_BUY';
    else if (totalScore >= 750 && riskScore <= 50) dealType = 'STRONG_OPPORTUNITY';
    else if (totalScore >= 600 && riskScore <= 75) dealType = 'GOOD_DEAL';
    else if (totalScore >= 450) dealType = 'MODERATE';
    else if (totalScore >= 300) dealType = 'WAIT';
    else dealType = 'AVOID';
    
    // GENERATE RECOMMENDATION
    let recommendation;
    switch(dealType) {
      case 'INSTANT_BUY': recommendation = '🔥 Exceptional opportunity - act immediately!'; break;
      case 'STRONG_OPPORTUNITY': recommendation = '⭐ Strong buy signal - excellent entry point'; break;
      case 'GOOD_DEAL': recommendation = '👍 Solid opportunity - worth considering'; break;
      case 'MODERATE': recommendation = '⚠️ Mixed signals - analyze carefully'; break;
      case 'WAIT': recommendation = '⏳ Better opportunities likely ahead'; break;
      case 'AVOID': recommendation = '❌ Poor fundamentals - skip this deal'; break;
    }
    
    return {
      aiScore: totalScore,
      dealType,
      recommendation,
      breakdown,
      insights: insights.slice(0, 5),
      warnings: warnings.slice(0, 3),
      pricePercentile: breakdown.pricePercentile
    };
  }
}

// SAMPLE DEALS DATA
const SAMPLE_DEALS = {
  excellentDeal: {
    title: 'Premium Wireless Headphones',
    salesPerMonth: 450,
    salesRank: 2500,
    currentBuyPrice: 18.99,
    lowestPriceEver: 17.99,
    highestPriceEver: 45.99,
    fbaOfferCount: 3,
    amazonInStock: false,
    outOfStockPercentage30d: 2.1
  },
  poorDeal: {
    title: 'Generic Phone Case',
    salesPerMonth: 8,
    salesRank: 850000,
    currentBuyPrice: 12.99,
    lowestPriceEver: 4.99,
    highestPriceEver: 14.99,
    fbaOfferCount: 28,
    amazonInStock: true,
    outOfStockPercentage30d: 25.8
  },
  moderateDeal: {
    title: 'Kitchen Gadget Pro',
    salesPerMonth: 120,
    salesRank: 15500,
    currentBuyPrice: 24.99,
    lowestPriceEver: 19.99,
    highestPriceEver: 34.99,
    fbaOfferCount: 9,
    amazonInStock: true,
    outOfStockPercentage30d: 8.5
  }
};

const ARBITRAGE_DATA = {
  excellentDeal: { buyPrice: 18.99, sellPrice: 32.99, profit: 8.50, roi: 44.8 },
  poorDeal: { buyPrice: 12.99, sellPrice: 15.99, profit: 0.85, roi: 6.5 },
  moderateDeal: { buyPrice: 24.99, sellPrice: 34.99, profit: 4.50, roi: 18.0 }
};

// RUN THE DEMO
function runDemo() {
  console.log('🧠 AI DEAL SCORING SYSTEM DEMO');
  console.log('═'.repeat(60));
  
  const scorer = new SimpleDealScorer();
  
  Object.entries(SAMPLE_DEALS).forEach(([dealType, keepaData]) => {
    const arbitrageData = ARBITRAGE_DATA[dealType];
    
    console.log(`\n🎯 ${dealType.toUpperCase().replace('DEAL', ' DEAL')}:`);
    console.log(`📦 ${keepaData.title}`);
    console.log(`💰 Buy: £${arbitrageData.buyPrice} → Sell: £${arbitrageData.sellPrice}`);
    console.log(`💵 Profit: £${arbitrageData.profit} (${arbitrageData.roi}% ROI)`);
    console.log(`📊 Sales: ${keepaData.salesPerMonth}/month | Rank: #${keepaData.salesRank.toLocaleString()}`);
    console.log(`🏪 Competition: ${keepaData.fbaOfferCount} FBA sellers`);
    console.log('─'.repeat(50));
    
    const analysis = scorer.analyzeDeal(keepaData, arbitrageData);
    
    // Main Score
    console.log(`🎯 AI SCORE: ${analysis.aiScore}/1000 - ${analysis.dealType}`);
    console.log(`${analysis.recommendation}`);
    
    // Score Breakdown
    console.log('\n📊 SCORE BREAKDOWN:');
    console.log(`   📈 Sales Performance: ${analysis.breakdown.salesScore}/250`);
    console.log(`   💰 Price Intelligence: ${analysis.breakdown.priceScore}/250 (${analysis.pricePercentile}th percentile)`);
    console.log(`   🏪 Competition: ${analysis.breakdown.competitionScore}/200`);
    console.log(`   🚀 Opportunity: ${analysis.breakdown.opportunityScore}/150`);
    console.log(`   ⚠️  Risk Level: ${analysis.breakdown.riskScore}/150 (${analysis.breakdown.riskScore <= 30 ? 'LOW' : analysis.breakdown.riskScore <= 75 ? 'MEDIUM' : 'HIGH'})`);
    
    // Insights
    if (analysis.insights.length > 0) {
      console.log('\n💡 KEY INSIGHTS:');
      analysis.insights.forEach((insight, i) => console.log(`   ${i + 1}. ${insight}`));
    }
    
    // Warnings
    if (analysis.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      analysis.warnings.forEach((warning, i) => console.log(`   ${i + 1}. ${warning}`));
    }
    
    console.log('\n' + '═'.repeat(60));
  });
  
  console.log('\n📚 SCORING SYSTEM EXPLAINED:');
  console.log('• Each deal gets scored across 5 key dimensions (1000 points total)');
  console.log('• Sales Performance (250): Monthly volume, rank, consistency');
  console.log('• Price Intelligence (250): Historic position, trends');
  console.log('• Competition Analysis (200): FBA count, Amazon presence');
  console.log('• Market Opportunity (150): ROI potential, profit margins');
  console.log('• Risk Assessment (150): Volatility, stock issues, saturation');
  console.log('\n🏆 SCORE INTERPRETATION:');
  console.log('• 850+: 🔥 INSTANT BUY - Exceptional opportunity');
  console.log('• 750+: ⭐ STRONG BUY - Excellent fundamentals');
  console.log('• 600+: 👍 GOOD DEAL - Solid opportunity');
  console.log('• 450+: ⚠️  MODERATE - Mixed signals');
  console.log('• 300+: ⏳ WAIT - Better opportunities ahead');
  console.log('• <300: ❌ AVOID - Poor fundamentals');
}

// Run the demo
runDemo();