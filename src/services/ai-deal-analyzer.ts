import { KeepaComprehensiveData } from '@/lib/keepa-comprehensive-api';
import { OpenAIDealEnhancer, OpenAIEnhancedAnalysis } from './openai-deal-enhancer';

export interface AIAnalysisResult {
  // Overall Scores
  aiScore: number; // 0-1000
  confidence: number; // 0-100%
  
  // Classifications
  dealType: 'INSTANT_BUY' | 'STRONG_OPPORTUNITY' | 'GOOD_DEAL' | 
            'MODERATE' | 'WAIT' | 'AVOID';
  
  // AI Predictions
  predictedPriceIn30Days: number | null;
  predictedSalesIn30Days: number | null;
  optimalBuyingWindow: string; // "Now" or "Wait X days"
  
  // Detailed Breakdown
  salesScore: number; // 0-250
  priceScore: number; // 0-250
  competitionScore: number; // 0-200
  opportunityScore: number; // 0-150
  riskScore: number; // 0-150 (lower is better)
  
  // Actionable Insights
  topInsights: string[];
  warnings: string[];
  opportunities: string[];
  
  // Trend Analysis
  priceTrend: 'STRONG_DOWN' | 'DOWN' | 'STABLE' | 'UP' | 'STRONG_UP';
  salesTrend: 'DECLINING' | 'STABLE' | 'GROWING' | 'SURGING';
  competitionTrend: 'DECREASING' | 'STABLE' | 'INCREASING' | 'SATURATED';
  
  // Historical Position
  currentPricePercentile: number; // 0-100, where 0 = historic low, 100 = historic high
  salesVelocityRank: 'VERY_LOW' | 'LOW' | 'AVERAGE' | 'HIGH' | 'VERY_HIGH';
  
  // OpenAI Enhanced Analysis (optional)
  openaiAnalysis?: OpenAIEnhancedAnalysis | null;
}

export interface TrendAnalysis {
  direction: 'STRONG_DOWN' | 'DOWN' | 'STABLE' | 'UP' | 'STRONG_UP';
  percentage: number;
  confidence: number;
  timeframe: string;
}

export interface PredictionModel {
  pricePredict30d: number | null;
  salesPredict30d: number | null;
  confidenceLevel: number;
  factorsConsidered: string[];
}

export class AIDealAnalyzer {
  private readonly SCORE_WEIGHTS = {
    SALES_PERFORMANCE: 0.25,      // 25% - How well it sells
    PRICE_INTELLIGENCE: 0.25,     // 25% - Price trends and positioning
    COMPETITION_ANALYSIS: 0.20,   // 20% - Competition landscape
    MARKET_OPPORTUNITY: 0.15,     // 15% - Growth and opportunity potential
    RISK_ASSESSMENT: 0.15,        // 15% - Risk factors
  };
  
  async analyzeComprehensively(
    keepaData: KeepaComprehensiveData,
    arbitrageData?: {
      buyPrice: number;
      sellPrice: number;
      profit: number;
      roi: number;
    },
    options?: {
      useOpenAI?: boolean;
    }
  ): Promise<AIAnalysisResult> {
    
    // 1. Analyze each component
    const salesAnalysis = this.analyzeSalesPerformance(keepaData);
    const priceAnalysis = this.analyzePriceIntelligence(keepaData);
    const competitionAnalysis = this.analyzeCompetition(keepaData);
    const opportunityAnalysis = this.analyzeMarketOpportunity(keepaData, arbitrageData);
    const riskAnalysis = this.assessRisks(keepaData);
    
    // 2. Generate predictions
    const predictions = this.generatePredictions(keepaData);
    
    // 3. Calculate composite AI score
    const aiScore = this.calculateCompositeScore(
      salesAnalysis.score,
      priceAnalysis.score,
      competitionAnalysis.score,
      opportunityAnalysis.score,
      riskAnalysis.score
    );
    
    // 4. Determine deal classification
    const dealType = this.classifyDeal(aiScore, riskAnalysis.score);
    
    // 5. Generate insights
    const insights = this.generateInsights(
      keepaData, 
      salesAnalysis, 
      priceAnalysis, 
      competitionAnalysis, 
      opportunityAnalysis, 
      riskAnalysis
    );
    
    // 6. Calculate confidence based on data quality
    const confidence = this.calculateConfidence(keepaData);
    
    // 7. Create base analysis result
    const baseResult: AIAnalysisResult = {
      aiScore,
      confidence,
      dealType,
      predictedPriceIn30Days: predictions.pricePredict30d,
      predictedSalesIn30Days: predictions.salesPredict30d,
      optimalBuyingWindow: this.determineOptimalTiming(priceAnalysis, riskAnalysis),
      
      // Detailed scores
      salesScore: salesAnalysis.score,
      priceScore: priceAnalysis.score,
      competitionScore: competitionAnalysis.score,
      opportunityScore: opportunityAnalysis.score,
      riskScore: riskAnalysis.score,
      
      // Insights
      topInsights: insights.top,
      warnings: insights.warnings,
      opportunities: insights.opportunities,
      
      // Trends
      priceTrend: priceAnalysis.trend.direction,
      salesTrend: salesAnalysis.trend,
      competitionTrend: competitionAnalysis.trend,
      
      // Historical position
      currentPricePercentile: priceAnalysis.percentile,
      salesVelocityRank: salesAnalysis.velocityRank,
    };
    
    // 8. Optionally enhance with OpenAI (only for profitable deals to save costs)
    if (options?.useOpenAI && OpenAIDealEnhancer.isAvailable() && arbitrageData && arbitrageData.profit > 0) {
      try {
        const openaiEnhancer = new OpenAIDealEnhancer();
        const openaiAnalysis = await openaiEnhancer.enhanceAnalysis(keepaData, baseResult, arbitrageData);
        
        if (openaiAnalysis) {
          // Apply score adjustment from OpenAI
          const adjustedScore = Math.min(1000, Math.max(0, baseResult.aiScore + openaiAnalysis.scoreAdjustment));
          
          baseResult.aiScore = adjustedScore;
          baseResult.openaiAnalysis = openaiAnalysis;
          
          // Re-classify deal type with adjusted score if significant change
          if (Math.abs(openaiAnalysis.scoreAdjustment) > 25) {
            baseResult.dealType = this.classifyDeal(adjustedScore, riskAnalysis.score);
          }
        }
      } catch (error) {
        console.error('[AI] OpenAI enhancement failed:', error);
        // Continue without OpenAI enhancement
      }
    }
    
    return baseResult;
  }
  
  private analyzeSalesPerformance(data: KeepaComprehensiveData): {
    score: number;
    trend: 'DECLINING' | 'STABLE' | 'GROWING' | 'SURGING';
    velocityRank: 'VERY_LOW' | 'LOW' | 'AVERAGE' | 'HIGH' | 'VERY_HIGH';
    insights: string[];
  } {
    let score = 0;
    const insights: string[] = [];
    
    // Sales Volume Analysis (0-100 points)
    const monthlySales = data.salesPerMonth || 0;
    if (monthlySales >= 500) {
      score += 100;
      insights.push(`Excellent sales velocity: ${monthlySales}/month`);
    } else if (monthlySales >= 200) {
      score += 80;
      insights.push(`Strong sales: ${monthlySales}/month`);
    } else if (monthlySales >= 100) {
      score += 60;
      insights.push(`Good sales: ${monthlySales}/month`);
    } else if (monthlySales >= 50) {
      score += 40;
      insights.push(`Moderate sales: ${monthlySales}/month`);
    } else if (monthlySales >= 20) {
      score += 20;
      insights.push(`Low sales: ${monthlySales}/month`);
    } else {
      score += 5;
      if (monthlySales > 0) {
        insights.push(`Very low sales: ${monthlySales}/month`);
      } else {
        insights.push('No reliable sales data available');
      }
    }
    
    // Sales Rank Analysis (0-75 points)
    if (data.salesRank) {
      if (data.salesRank <= 1000) {
        score += 75;
        insights.push(`Excellent sales rank: #${data.salesRank.toLocaleString()}`);
      } else if (data.salesRank <= 10000) {
        score += 60;
        insights.push(`Good sales rank: #${data.salesRank.toLocaleString()}`);
      } else if (data.salesRank <= 50000) {
        score += 40;
        insights.push(`Average sales rank: #${data.salesRank.toLocaleString()}`);
      } else if (data.salesRank <= 100000) {
        score += 20;
        insights.push(`Below average sales rank: #${data.salesRank.toLocaleString()}`);
      } else {
        score += 5;
        insights.push(`Poor sales rank: #${data.salesRank.toLocaleString()}`);
      }
    }
    
    // Data Quality Bonus (0-25 points)
    if (data.spmConfidence === 'very_high') {
      score += 25;
      insights.push('Sales data is highly reliable (all-time history)');
    } else if (data.spmConfidence === 'high') {
      score += 20;
      insights.push('Sales data is reliable (90+ days)');
    } else if (data.spmConfidence === 'medium') {
      score += 10;
      insights.push('Sales data has medium reliability (30 days)');
    } else {
      insights.push('Limited sales data available');
    }
    
    // Consistency Analysis (0-50 points)
    const consistencyScore = this.analyzeSalesConsistency(data);
    score += consistencyScore;
    if (consistencyScore >= 40) {
      insights.push('Sales are very consistent over time');
    } else if (consistencyScore >= 25) {
      insights.push('Sales show good consistency');
    } else if (consistencyScore >= 15) {
      insights.push('Sales are somewhat irregular');
    } else {
      insights.push('Sales pattern is highly volatile');
    }
    
    // Determine trend and velocity rank
    const trend = this.determineSalesTrend(data);
    const velocityRank = this.classifySalesVelocity(monthlySales);
    
    return {
      score: Math.min(250, score), // Cap at 250
      trend,
      velocityRank,
      insights
    };
  }
  
  private analyzePriceIntelligence(data: KeepaComprehensiveData): {
    score: number;
    trend: TrendAnalysis;
    percentile: number;
    insights: string[];
  } {
    let score = 0;
    const insights: string[] = [];
    
    // Current Price Position Analysis (0-100 points)
    const percentile = this.calculatePricePercentile(data);
    if (percentile <= 20) {
      score += 100;
      insights.push(`Excellent price: ${percentile}th percentile (near historic low)`);
    } else if (percentile <= 40) {
      score += 80;
      insights.push(`Good price: ${percentile}th percentile (below average)`);
    } else if (percentile <= 60) {
      score += 60;
      insights.push(`Average price: ${percentile}th percentile`);
    } else if (percentile <= 80) {
      score += 30;
      insights.push(`Above average price: ${percentile}th percentile`);
    } else {
      score += 5;
      insights.push(`High price: ${percentile}th percentile (near historic high)`);
    }
    
    // Price Trend Analysis (0-75 points)
    const trend = this.analyzePriceTrend(data);
    if (trend.direction === 'STRONG_DOWN') {
      score += 75;
      insights.push(`Strong downward price trend: ${trend.percentage.toFixed(1)}% over ${trend.timeframe}`);
    } else if (trend.direction === 'DOWN') {
      score += 60;
      insights.push(`Downward price trend: ${trend.percentage.toFixed(1)}% over ${trend.timeframe}`);
    } else if (trend.direction === 'STABLE') {
      score += 45;
      insights.push(`Stable pricing over ${trend.timeframe}`);
    } else if (trend.direction === 'UP') {
      score += 20;
      insights.push(`Upward price trend: ${trend.percentage.toFixed(1)}% over ${trend.timeframe}`);
    } else {
      score += 5;
      insights.push(`Strong upward price trend: ${trend.percentage.toFixed(1)}% over ${trend.timeframe}`);
    }
    
    // Price Stability Analysis (0-50 points)
    const volatility = this.calculatePriceVolatility(data);
    if (volatility <= 10) {
      score += 50;
      insights.push('Very stable pricing (low volatility)');
    } else if (volatility <= 20) {
      score += 40;
      insights.push('Stable pricing');
    } else if (volatility <= 35) {
      score += 25;
      insights.push('Moderate price volatility');
    } else if (volatility <= 50) {
      score += 10;
      insights.push('High price volatility');
    } else {
      score += 0;
      insights.push('Extremely volatile pricing - high risk');
    }
    
    // Recent Price Action (0-25 points)
    const recentAction = this.analyzeRecentPriceAction(data);
    score += recentAction.score;
    insights.push(recentAction.insight);
    
    return {
      score: Math.min(250, score),
      trend,
      percentile,
      insights
    };
  }
  
  private analyzeCompetition(data: KeepaComprehensiveData): {
    score: number;
    trend: 'DECREASING' | 'STABLE' | 'INCREASING' | 'SATURATED';
    insights: string[];
  } {
    let score = 0;
    const insights: string[] = [];
    
    // FBA Competition Analysis (0-100 points)
    const fbaCount = data.fbaOfferCount;
    if (fbaCount <= 2) {
      score += 100;
      insights.push(`Excellent: Only ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 5) {
      score += 80;
      insights.push(`Good: ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 10) {
      score += 60;
      insights.push(`Moderate: ${fbaCount} FBA competitors`);
    } else if (fbaCount <= 20) {
      score += 30;
      insights.push(`High competition: ${fbaCount} FBA competitors`);
    } else {
      score += 5;
      insights.push(`Saturated: ${fbaCount} FBA competitors`);
    }
    
    // Amazon Presence Analysis (0-50 points)
    if (!data.amazonInStock) {
      score += 50;
      insights.push('Amazon not in stock - good opportunity');
    } else {
      score += 10;
      insights.push('Amazon is in stock - strong competition');
    }
    
    // Buy Box Win Rate Analysis (0-30 points)
    if (data.buyBoxWinRate !== null) {
      if (data.buyBoxWinRate >= 80) {
        score += 30;
        insights.push(`High buy box win rate: ${data.buyBoxWinRate.toFixed(1)}%`);
      } else if (data.buyBoxWinRate >= 60) {
        score += 20;
        insights.push(`Good buy box win rate: ${data.buyBoxWinRate.toFixed(1)}%`);
      } else if (data.buyBoxWinRate >= 40) {
        score += 10;
        insights.push(`Average buy box win rate: ${data.buyBoxWinRate.toFixed(1)}%`);
      } else {
        score += 5;
        insights.push(`Low buy box win rate: ${data.buyBoxWinRate.toFixed(1)}%`);
      }
    }
    
    // Competition Trend Analysis (0-20 points)
    const trend = this.analyzeCompetitionTrend(data);
    if (trend === 'DECREASING') {
      score += 20;
      insights.push('Competition is decreasing over time');
    } else if (trend === 'STABLE') {
      score += 15;
      insights.push('Competition level is stable');
    } else if (trend === 'INCREASING') {
      score += 5;
      insights.push('Competition is increasing - monitor closely');
    } else {
      score += 0;
      insights.push('Market is saturated with competitors');
    }
    
    return {
      score: Math.min(200, score),
      trend,
      insights
    };
  }
  
  private analyzeMarketOpportunity(
    data: KeepaComprehensiveData, 
    arbitrageData?: { buyPrice: number; sellPrice: number; profit: number; roi: number }
  ): {
    score: number;
    insights: string[];
  } {
    let score = 0;
    const insights: string[] = [];
    
    // Arbitrage Opportunity (0-75 points)
    if (arbitrageData) {
      if (arbitrageData.roi >= 50) {
        score += 75;
        insights.push(`Excellent ROI: ${arbitrageData.roi.toFixed(1)}%`);
      } else if (arbitrageData.roi >= 30) {
        score += 60;
        insights.push(`Strong ROI: ${arbitrageData.roi.toFixed(1)}%`);
      } else if (arbitrageData.roi >= 20) {
        score += 40;
        insights.push(`Good ROI: ${arbitrageData.roi.toFixed(1)}%`);
      } else if (arbitrageData.roi >= 10) {
        score += 20;
        insights.push(`Moderate ROI: ${arbitrageData.roi.toFixed(1)}%`);
      } else {
        score += 5;
        insights.push(`Low ROI: ${arbitrageData.roi.toFixed(1)}%`);
      }
    }
    
    // Market Size Analysis (0-40 points)
    const marketSize = this.assessMarketSize(data);
    score += marketSize.score;
    insights.push(marketSize.insight);
    
    // Growth Potential (0-35 points)
    const growthPotential = this.assessGrowthPotential(data);
    score += growthPotential.score;
    insights.push(growthPotential.insight);
    
    return {
      score: Math.min(150, score),
      insights
    };
  }
  
  private assessRisks(data: KeepaComprehensiveData): {
    score: number; // Lower is better for risk
    insights: string[];
  } {
    let riskScore = 0; // Start with no risk
    const insights: string[] = [];
    
    // Price Volatility Risk (0-40 points)
    const volatility = this.calculatePriceVolatility(data);
    if (volatility > 50) {
      riskScore += 40;
      insights.push('HIGH RISK: Extremely volatile pricing');
    } else if (volatility > 35) {
      riskScore += 25;
      insights.push('MEDIUM RISK: High price volatility');
    } else if (volatility > 20) {
      riskScore += 10;
      insights.push('LOW RISK: Moderate price volatility');
    }
    
    // Out of Stock Risk (0-30 points)
    if (data.outOfStockPercentage30d && data.outOfStockPercentage30d > 20) {
      riskScore += 30;
      insights.push(`HIGH RISK: Out of stock ${data.outOfStockPercentage30d.toFixed(1)}% of time`);
    } else if (data.outOfStockPercentage30d && data.outOfStockPercentage30d > 10) {
      riskScore += 15;
      insights.push(`MEDIUM RISK: Occasional stock issues`);
    }
    
    // Competition Surge Risk (0-40 points)
    if (data.fbaOfferCount > 20) {
      riskScore += 40;
      insights.push('HIGH RISK: Saturated market');
    } else if (data.fbaOfferCount > 10) {
      riskScore += 20;
      insights.push('MEDIUM RISK: High competition');
    }
    
    // Price Trend Risk (0-40 points)
    const currentPercentile = this.calculatePricePercentile(data);
    if (currentPercentile > 80) {
      riskScore += 40;
      insights.push('HIGH RISK: Price near historic high');
    } else if (currentPercentile > 60) {
      riskScore += 20;
      insights.push('MEDIUM RISK: Above average pricing');
    }
    
    // Low risk indicators
    if (riskScore === 0) {
      insights.push('LOW RISK: Stable market conditions');
    }
    
    return {
      score: Math.min(150, riskScore),
      insights
    };
  }
  
  private generatePredictions(data: KeepaComprehensiveData): PredictionModel {
    // Simple trend-based predictions (can be enhanced with ML models)
    const priceTrend = this.analyzePriceTrend(data);
    const currentPrice = data.currentBuyPrice;
    
    let pricePredict30d: number | null = null;
    if (currentPrice) {
      const trendMultiplier = this.getTrendMultiplier(priceTrend.direction);
      pricePredict30d = currentPrice * (1 + (priceTrend.percentage / 100) * trendMultiplier);
    }
    
    let salesPredict30d: number | null = null;
    if (data.salesPerMonth) {
      // Simple seasonal adjustment (can be enhanced)
      salesPredict30d = data.salesPerMonth * this.getSeasonalMultiplier();
    }
    
    const confidenceLevel = this.calculatePredictionConfidence(data);
    
    return {
      pricePredict30d,
      salesPredict30d,
      confidenceLevel,
      factorsConsidered: [
        'Historical price trends',
        'Sales velocity patterns',
        'Competition dynamics',
        'Seasonal factors'
      ]
    };
  }
  
  private calculateCompositeScore(
    salesScore: number,
    priceScore: number,
    competitionScore: number,
    opportunityScore: number,
    riskScore: number
  ): number {
    const weights = this.SCORE_WEIGHTS;
    
    // Risk score is inverted (lower risk = higher score)
    const adjustedRiskScore = 150 - riskScore;
    
    const weightedScore = 
      (salesScore * weights.SALES_PERFORMANCE) +
      (priceScore * weights.PRICE_INTELLIGENCE) +
      (competitionScore * weights.COMPETITION_ANALYSIS) +
      (opportunityScore * weights.MARKET_OPPORTUNITY) +
      (adjustedRiskScore * weights.RISK_ASSESSMENT);
    
    return Math.round(Math.min(1000, weightedScore));
  }
  
  private classifyDeal(aiScore: number, riskScore: number): AIAnalysisResult['dealType'] {
    if (aiScore >= 850 && riskScore <= 30) return 'INSTANT_BUY';
    if (aiScore >= 750 && riskScore <= 50) return 'STRONG_OPPORTUNITY';
    if (aiScore >= 600 && riskScore <= 75) return 'GOOD_DEAL';
    if (aiScore >= 450) return 'MODERATE';
    if (aiScore >= 300 || riskScore > 100) return 'WAIT';
    return 'AVOID';
  }
  
  // Helper methods for calculations
  private calculatePricePercentile(data: KeepaComprehensiveData): number {
    if (!data.currentBuyPrice || !data.lowestPriceEver || !data.highestPriceEver) {
      return 50; // Default to middle if no data
    }
    
    const range = data.highestPriceEver - data.lowestPriceEver;
    if (range === 0) return 50;
    
    const position = data.currentBuyPrice - data.lowestPriceEver;
    return Math.round((position / range) * 100);
  }
  
  private analyzePriceTrend(data: KeepaComprehensiveData): TrendAnalysis {
    const current = data.currentBuyPrice || 0;
    const price180d = data.buyPrice180d || current;
    
    const change = ((current - price180d) / price180d) * 100;
    
    let direction: TrendAnalysis['direction'] = 'STABLE';
    if (change <= -20) direction = 'STRONG_DOWN';
    else if (change <= -10) direction = 'DOWN';
    else if (change >= 20) direction = 'STRONG_UP';
    else if (change >= 10) direction = 'UP';
    
    return {
      direction,
      percentage: Math.abs(change),
      confidence: 85, // Can be enhanced with more sophisticated analysis
      timeframe: '180 days'
    };
  }
  
  private calculatePriceVolatility(data: KeepaComprehensiveData): number {
    // Simple volatility calculation based on high/low range
    if (!data.highestPriceEver || !data.lowestPriceEver || !data.avgPriceAllTime) {
      return 50; // Default high volatility if no data
    }
    
    const range = data.highestPriceEver - data.lowestPriceEver;
    const avgPrice = data.avgPriceAllTime;
    
    return (range / avgPrice) * 100;
  }
  
  private analyzeSalesConsistency(data: KeepaComprehensiveData): number {
    // Simple consistency score based on data availability and confidence
    let score = 0;
    
    if (data.spmConfidence === 'very_high') score += 50;
    else if (data.spmConfidence === 'high') score += 40;
    else if (data.spmConfidence === 'medium') score += 25;
    else if (data.spmConfidence === 'low') score += 10;
    
    return score;
  }
  
  private determineSalesTrend(data: KeepaComprehensiveData): 'DECLINING' | 'STABLE' | 'GROWING' | 'SURGING' {
    // Compare different time periods if available
    const drops30d = data.salesDrops30d;
    const drops90d = data.salesDrops90d;
    
    if (drops90d === 0) return 'DECLINING';
    
    const monthlyTrend = (drops30d / (drops90d / 3)) - 1;
    
    if (monthlyTrend >= 0.5) return 'SURGING';
    if (monthlyTrend >= 0.2) return 'GROWING';
    if (monthlyTrend >= -0.2) return 'STABLE';
    return 'DECLINING';
  }
  
  private classifySalesVelocity(monthlySales: number): 'VERY_LOW' | 'LOW' | 'AVERAGE' | 'HIGH' | 'VERY_HIGH' {
    if (monthlySales >= 500) return 'VERY_HIGH';
    if (monthlySales >= 200) return 'HIGH';
    if (monthlySales >= 100) return 'AVERAGE';
    if (monthlySales >= 50) return 'LOW';
    return 'VERY_LOW';
  }
  
  private analyzeCompetitionTrend(data: KeepaComprehensiveData): 'DECREASING' | 'STABLE' | 'INCREASING' | 'SATURATED' {
    // Simple analysis based on current competition level
    if (data.fbaOfferCount > 20) return 'SATURATED';
    if (data.fbaOfferCount > 15) return 'INCREASING';
    if (data.fbaOfferCount > 5) return 'STABLE';
    return 'DECREASING';
  }
  
  private analyzeRecentPriceAction(data: KeepaComprehensiveData): { score: number; insight: string } {
    const current = data.currentBuyPrice || 0;
    const price30d = data.buyPrice30d || current;
    
    const recentChange = ((current - price30d) / price30d) * 100;
    
    if (recentChange <= -10) {
      return { score: 25, insight: 'Recent price drop detected - good entry opportunity' };
    } else if (recentChange <= -5) {
      return { score: 20, insight: 'Slight recent price decline' };
    } else if (recentChange <= 5) {
      return { score: 15, insight: 'Stable recent pricing' };
    } else if (recentChange <= 10) {
      return { score: 5, insight: 'Recent price increase detected' };
    } else {
      return { score: 0, insight: 'Strong recent price increase - poor entry timing' };
    }
  }
  
  private assessMarketSize(data: KeepaComprehensiveData): { score: number; insight: string } {
    const monthlySales = data.salesPerMonth || 0;
    const totalOffers = data.totalOfferCount;
    
    if (monthlySales >= 200 && totalOffers <= 10) {
      return { score: 40, insight: 'Large market with reasonable competition' };
    } else if (monthlySales >= 100) {
      return { score: 30, insight: 'Good-sized market opportunity' };
    } else if (monthlySales >= 50) {
      return { score: 20, insight: 'Moderate market size' };
    } else {
      return { score: 10, insight: 'Small market - limited opportunity' };
    }
  }
  
  private assessGrowthPotential(data: KeepaComprehensiveData): { score: number; insight: string } {
    // Simple growth assessment based on review velocity and sales trend
    const reviewCount = data.reviewCount || 0;
    
    if (reviewCount >= 1000) {
      return { score: 35, insight: 'Established product with growth potential' };
    } else if (reviewCount >= 500) {
      return { score: 25, insight: 'Growing product with good momentum' };
    } else if (reviewCount >= 100) {
      return { score: 15, insight: 'Emerging product with potential' };
    } else {
      return { score: 5, insight: 'New or slow-growing product' };
    }
  }
  
  private getTrendMultiplier(direction: TrendAnalysis['direction']): number {
    switch (direction) {
      case 'STRONG_DOWN': return -0.3;
      case 'DOWN': return -0.15;
      case 'STABLE': return 0;
      case 'UP': return 0.15;
      case 'STRONG_UP': return 0.3;
    }
  }
  
  private getSeasonalMultiplier(): number {
    // Simple seasonal adjustment - can be enhanced with historical data
    const month = new Date().getMonth();
    if (month >= 10 || month <= 1) return 1.2; // Holiday season
    if (month >= 6 && month <= 8) return 0.9; // Summer slowdown
    return 1.0; // Normal
  }
  
  private calculatePredictionConfidence(data: KeepaComprehensiveData): number {
    let confidence = 50; // Base confidence
    
    if (data.dataCompleteness >= 80) confidence += 20;
    else if (data.dataCompleteness >= 60) confidence += 10;
    
    if (data.spmConfidence === 'very_high') confidence += 20;
    else if (data.spmConfidence === 'high') confidence += 15;
    else if (data.spmConfidence === 'medium') confidence += 10;
    
    if (data.priceHistory.length >= 100) confidence += 10;
    
    return Math.min(95, confidence);
  }
  
  private calculateConfidence(data: KeepaComprehensiveData): number {
    // Overall confidence in the analysis based on data quality
    let confidence = data.dataCompleteness;
    
    // Boost confidence for high-quality sales data
    if (data.spmConfidence === 'very_high') confidence += 10;
    else if (data.spmConfidence === 'high') confidence += 5;
    
    // Reduce confidence for very new or limited data
    if (data.reviewCount < 50) confidence -= 10;
    if (data.priceHistory.length < 30) confidence -= 5;
    
    return Math.max(0, Math.min(100, confidence));
  }
  
  private determineOptimalTiming(
    priceAnalysis: { trend: TrendAnalysis; percentile: number },
    riskAnalysis: { score: number }
  ): string {
    if (priceAnalysis.trend.direction === 'STRONG_DOWN' && priceAnalysis.percentile <= 30) {
      return 'Now - Price dropping and near low';
    }
    
    if (priceAnalysis.percentile <= 20 && riskAnalysis.score <= 50) {
      return 'Now - Excellent entry price';
    }
    
    if (priceAnalysis.trend.direction === 'UP' || priceAnalysis.trend.direction === 'STRONG_UP') {
      return 'Wait 1-2 weeks for better entry';
    }
    
    if (priceAnalysis.percentile > 70) {
      return 'Wait for price to drop below 50th percentile';
    }
    
    return 'Now - Good entry timing';
  }
  
  private generateInsights(
    data: KeepaComprehensiveData,
    salesAnalysis: any,
    priceAnalysis: any,
    competitionAnalysis: any,
    opportunityAnalysis: any,
    riskAnalysis: any
  ): { top: string[]; warnings: string[]; opportunities: string[] } {
    const top: string[] = [];
    const warnings: string[] = [];
    const opportunities: string[] = [];
    
    // Top insights
    if (salesAnalysis.score >= 200) {
      top.push(`🚀 Excellent sales performance: ${data.salesPerMonth}/month`);
    }
    
    if (priceAnalysis.percentile <= 25) {
      top.push(`💰 Price near historic low (${priceAnalysis.percentile}th percentile)`);
    }
    
    if (competitionAnalysis.score >= 150) {
      top.push(`🎯 Low competition environment`);
    }
    
    // Warnings
    if (riskAnalysis.score >= 100) {
      warnings.push(`⚠️ High risk factors detected`);
    }
    
    if (data.fbaOfferCount > 15) {
      warnings.push(`⚠️ High competition: ${data.fbaOfferCount} FBA sellers`);
    }
    
    if (priceAnalysis.trend.direction === 'STRONG_UP') {
      warnings.push(`⚠️ Strong upward price trend - poor entry timing`);
    }
    
    // Opportunities
    if (priceAnalysis.trend.direction === 'STRONG_DOWN') {
      opportunities.push(`📉 Strong price decline - potential bottom approaching`);
    }
    
    if (!data.amazonInStock) {
      opportunities.push(`🏪 Amazon out of stock - reduced competition`);
    }
    
    if (salesAnalysis.trend === 'GROWING' || salesAnalysis.trend === 'SURGING') {
      opportunities.push(`📈 Growing sales trend detected`);
    }
    
    return { top, warnings, opportunities };
  }
}

export default AIDealAnalyzer;