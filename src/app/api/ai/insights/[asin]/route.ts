import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest } from '@/lib/auth';
import { getServiceRoleClient } from '@/lib/supabase-server';

interface RouteParams {
  asin: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Get parameters
    const { asin } = await context.params;
    
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
      return NextResponse.json(
        { error: 'Valid ASIN is required' },
        { status: 400 }
      );
    }
    
    const supabase = getServiceRoleClient();
    
    // Get comprehensive AI analysis and Keepa data
    const [analysisResult, keepaResult, historyResult] = await Promise.all([
      // Latest AI analysis
      supabase
        .from('ai_deal_analysis')
        .select('*')
        .eq('asin', asin.toUpperCase())
        .eq('user_id', user.id)
        .order('analysis_timestamp', { ascending: false })
        .limit(1)
        .single(),
      
      // Comprehensive Keepa data
      supabase
        .from('keepa_comprehensive_data')
        .select('*')
        .eq('asin', asin.toUpperCase())
        .eq('user_id', user.id)
        .single(),
      
      // Historical deal scores
      supabase
        .from('deal_analysis_history')
        .select('deal_score, analysis_date, roi, estimated_sales')
        .eq('asin', asin.toUpperCase())
        .eq('user_id', user.id)
        .order('analysis_date', { ascending: false })
        .limit(10)
    ]);
    
    if (analysisResult.error || !analysisResult.data) {
      return NextResponse.json(
        { 
          error: 'No AI analysis found for this ASIN',
          suggestion: 'Generate analysis first using /api/ai/analyze-deal'
        },
        { status: 404 }
      );
    }
    
    const analysis = analysisResult.data;
    const keepaData = keepaResult.data;
    const history = historyResult.data || [];
    
    // Generate comprehensive insights
    const insights = {
      // Executive Summary
      summary: {
        asin: analysis.asin,
        title: keepaData?.title || 'Unknown Product',
        aiScore: analysis.ai_score,
        dealClassification: analysis.deal_classification,
        confidence: analysis.confidence_percentage,
        lastUpdated: analysis.analysis_timestamp,
        quickRecommendation: generateQuickRecommendation(analysis)
      },
      
      // Detailed Score Breakdown
      scoreBreakdown: {
        total: analysis.ai_score,
        components: {
          sales: {
            score: analysis.sales_score,
            maxScore: 250,
            percentage: Math.round((analysis.sales_score / 250) * 100),
            trend: analysis.sales_trend,
            velocity: analysis.sales_velocity_rank
          },
          price: {
            score: analysis.price_score,
            maxScore: 250,
            percentage: Math.round((analysis.price_score / 250) * 100),
            trend: analysis.price_trend,
            percentile: analysis.current_price_percentile
          },
          competition: {
            score: analysis.competition_score,
            maxScore: 200,
            percentage: Math.round((analysis.competition_score / 200) * 100),
            trend: analysis.competition_trend,
            fbaCount: keepaData?.fba_offer_count
          },
          opportunity: {
            score: analysis.opportunity_score,
            maxScore: 150,
            percentage: Math.round((analysis.opportunity_score / 150) * 100)
          },
          risk: {
            score: analysis.risk_score,
            maxScore: 150,
            percentage: Math.round((analysis.risk_score / 150) * 100),
            level: analysis.risk_score <= 30 ? 'LOW' : 
                   analysis.risk_score <= 75 ? 'MEDIUM' : 'HIGH'
          }
        }
      },
      
      // Market Intelligence
      marketIntelligence: {
        pricing: {
          current: keepaData?.current_buy_price ? keepaData.current_buy_price / 100 : null,
          lowest: keepaData?.lowest_price_ever ? keepaData.lowest_price_ever / 100 : null,
          highest: keepaData?.highest_price_ever ? keepaData.highest_price_ever / 100 : null,
          average: keepaData?.avg_price_all_time ? keepaData.avg_price_all_time / 100 : null,
          percentile: analysis.current_price_percentile,
          trend: analysis.price_trend,
          changeFrequency: keepaData?.price_change_frequency
        },
        sales: {
          monthly: keepaData?.sales_per_month,
          rank: keepaData?.current_sales_rank,
          drops30d: keepaData?.sales_drops_30d,
          drops90d: keepaData?.sales_drops_90d,
          trend: analysis.sales_trend,
          velocity: analysis.sales_velocity_rank,
          dataSource: keepaData?.spm_data_source,
          confidence: keepaData?.spm_confidence
        },
        competition: {
          total: keepaData?.total_offer_count,
          fba: keepaData?.fba_offer_count,
          fbm: keepaData?.fbm_offer_count,
          amazonInStock: keepaData?.amazon_in_stock,
          buyBoxWinRate: keepaData?.buy_box_win_rate,
          trend: analysis.competition_trend
        },
        availability: {
          outOfStock30d: keepaData?.out_of_stock_percentage_30d,
          outOfStock90d: keepaData?.out_of_stock_percentage_90d
        }
      },
      
      // AI-Generated Insights
      aiInsights: {
        top: analysis.top_insights || [],
        warnings: analysis.warnings || [],
        opportunities: analysis.opportunities || []
      },
      
      // Predictions
      predictions: {
        price30d: analysis.predicted_price_30d,
        sales30d: analysis.predicted_sales_30d,
        optimalTiming: analysis.optimal_buy_timing,
        confidence: analysis.confidence_percentage
      },
      
      // Historical Performance
      historicalTrends: generateHistoricalTrends(history),
      
      // Action Items
      actionItems: generateActionItems(analysis, keepaData),
      
      // Data Quality
      dataQuality: {
        completeness: analysis.data_completeness,
        keepaSource: analysis.keepa_data_source,
        keepaConfidence: analysis.keepa_confidence,
        lastKeepaUpdate: keepaData?.last_updated,
        reviewCount: keepaData?.review_count,
        rating: keepaData?.rating
      }
    };
    
    return NextResponse.json({
      success: true,
      data: insights
    });
    
  } catch (error) {
    console.error('AI insights error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function generateQuickRecommendation(analysis: any): string {
  const score = analysis.ai_score;
  const classification = analysis.deal_classification;
  const pricePercentile = analysis.current_price_percentile;
  const riskScore = analysis.risk_score;
  
  if (score >= 850 && riskScore <= 30) {
    return '🚀 INSTANT BUY - Exceptional opportunity with low risk';
  } else if (score >= 750 && riskScore <= 50) {
    return '⭐ STRONG BUY - Excellent fundamentals, good entry point';
  } else if (score >= 600 && riskScore <= 75) {
    return '👍 GOOD DEAL - Solid opportunity, consider buying';
  } else if (score >= 450) {
    return '⚠️ MODERATE - Analyze carefully, mixed signals';
  } else if (score >= 300) {
    return '⏳ WAIT - Better opportunities likely ahead';
  } else {
    return '❌ AVOID - Poor fundamentals, high risk';
  }
}

function generateHistoricalTrends(history: any[]): any {
  if (history.length === 0) {
    return {
      available: false,
      message: 'No historical data available'
    };
  }
  
  const scores = history.map(h => h.deal_score).filter(s => s !== null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const latestScore = scores[0] || 0;
  const scoreTrend = scores.length >= 2 ? (latestScore > scores[1] ? 'IMPROVING' : 
                     latestScore < scores[1] ? 'DECLINING' : 'STABLE') : 'UNKNOWN';
  
  return {
    available: true,
    dataPoints: history.length,
    averageScore: avgScore,
    latestScore,
    scoreTrend,
    timespan: history.length > 0 ? {
      from: history[history.length - 1].analysis_date,
      to: history[0].analysis_date
    } : null
  };
}

function generateActionItems(analysis: any, keepaData: any): string[] {
  const items: string[] = [];
  
  // Based on AI score
  if (analysis.ai_score >= 750) {
    items.push('✅ Consider immediate purchase - strong opportunity');
  } else if (analysis.ai_score <= 300) {
    items.push('❌ Skip this opportunity - better deals available');
  }
  
  // Based on price percentile
  if (analysis.current_price_percentile <= 25) {
    items.push('💰 Price is near historic low - good entry point');
  } else if (analysis.current_price_percentile >= 75) {
    items.push('⏳ Wait for price to drop - currently expensive');
  }
  
  // Based on competition
  if (keepaData?.fba_offer_count <= 3) {
    items.push('🎯 Low competition - good market conditions');
  } else if (keepaData?.fba_offer_count >= 15) {
    items.push('⚠️ High competition - be cautious with pricing');
  }
  
  // Based on sales
  if (keepaData?.sales_per_month >= 200) {
    items.push('📈 Strong sales velocity - high demand product');
  } else if (keepaData?.sales_per_month <= 20) {
    items.push('📉 Low sales volume - verify market demand');
  }
  
  // Based on trends
  if (analysis.price_trend === 'STRONG_DOWN') {
    items.push('📉 Strong price decline - consider waiting for bottom');
  } else if (analysis.price_trend === 'STRONG_UP') {
    items.push('📈 Rising prices - entry window may be closing');
  }
  
  // Risk warnings
  if (analysis.risk_score >= 100) {
    items.push('⚠️ High risk detected - proceed with caution');
  }
  
  // Data quality
  if (analysis.data_completeness < 70) {
    items.push('📊 Limited data available - consider additional research');
  }
  
  return items;
}