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
    
    // Get most recent AI analysis for this ASIN
    const { data: analysis, error } = await supabase
      .from('ai_deal_analysis')
      .select(`
        asin,
        ai_score,
        deal_classification,
        confidence_percentage,
        price_trend,
        sales_trend,
        competition_trend,
        current_price_percentile,
        sales_velocity_rank,
        optimal_buy_timing,
        analysis_timestamp,
        top_insights,
        warnings
      `)
      .eq('asin', asin.toUpperCase())
      .eq('user_id', user.id)
      .order('analysis_timestamp', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !analysis) {
      return NextResponse.json(
        { 
          error: 'No AI analysis found for this ASIN',
          suggestion: 'Use /api/ai/analyze-deal to generate analysis first'
        },
        { status: 404 }
      );
    }
    
    // Calculate age of analysis
    const analysisAge = Date.now() - new Date(analysis.analysis_timestamp).getTime();
    const hoursOld = Math.round(analysisAge / (1000 * 60 * 60));
    
    // Get basic product info from Keepa data
    const { data: productInfo } = await supabase
      .from('keepa_comprehensive_data')
      .select('title, current_buy_price, sales_per_month, fba_offer_count')
      .eq('asin', asin.toUpperCase())
      .eq('user_id', user.id)
      .single();
    
    const response = {
      asin: analysis.asin,
      aiScore: analysis.ai_score,
      dealClassification: analysis.deal_classification,
      confidence: analysis.confidence_percentage,
      
      // Quick insights
      pricePosition: getPricePositionText(analysis.current_price_percentile),
      salesVelocity: analysis.sales_velocity_rank,
      competitionLevel: getCompetitionLevelText(productInfo?.fba_offer_count || 0),
      
      // Trends
      priceTrend: analysis.price_trend,
      salesTrend: analysis.sales_trend,
      competitionTrend: analysis.competition_trend,
      
      // Key metrics
      currentPrice: productInfo?.current_buy_price ? productInfo.current_buy_price / 100 : null,
      monthlySales: productInfo?.sales_per_month,
      fbaCompetitors: productInfo?.fba_offer_count,
      
      // Timing
      optimalTiming: analysis.optimal_buy_timing,
      
      // Top insight and warning
      topInsight: analysis.top_insights?.[0] || null,
      topWarning: analysis.warnings?.[0] || null,
      
      // Metadata
      analysisAge: {
        hours: hoursOld,
        isRecent: hoursOld <= 24,
        text: hoursOld < 1 ? 'Less than 1 hour ago' : 
              hoursOld === 1 ? '1 hour ago' : 
              hoursOld < 24 ? `${hoursOld} hours ago` : 
              `${Math.round(hoursOld / 24)} days ago`
      },
      productTitle: productInfo?.title || 'Unknown Product',
      
      // Quick recommendation
      recommendation: getQuickRecommendation(
        analysis.ai_score, 
        analysis.deal_classification,
        analysis.current_price_percentile
      )
    };
    
    return NextResponse.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('Quick score error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper functions for text generation
function getPricePositionText(percentile: number | null): string {
  if (percentile === null) return 'Unknown';
  if (percentile <= 20) return 'Near historic low';
  if (percentile <= 40) return 'Below average';
  if (percentile <= 60) return 'Average price';
  if (percentile <= 80) return 'Above average';
  return 'Near historic high';
}

function getCompetitionLevelText(fbaCount: number): string {
  if (fbaCount <= 2) return 'Very low competition';
  if (fbaCount <= 5) return 'Low competition';
  if (fbaCount <= 10) return 'Moderate competition';
  if (fbaCount <= 20) return 'High competition';
  return 'Very high competition';
}

function getQuickRecommendation(
  score: number, 
  classification: string, 
  pricePercentile: number | null
): string {
  if (score >= 850) return '🔥 Excellent opportunity - act quickly!';
  if (score >= 750) return '⭐ Strong buy signal - good opportunity';
  if (score >= 600) return '👍 Good deal - worth considering';
  if (score >= 450) return '⚠️ Moderate opportunity - analyze carefully';
  if (score >= 300) return '⏳ Wait for better conditions';
  return '❌ Avoid - poor opportunity';
}