import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest } from '@/lib/auth';
import { getServiceRoleClient } from '@/lib/supabase-server';
import { KeepaComprehensiveAPI } from '@/lib/keepa-comprehensive-api';
import { AIDealAnalyzer } from '@/services/ai-deal-analyzer';
import { checkEnvVars } from '@/lib/env-check';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Parse request body
    const body = await request.json();
    const { asin, includeHistoricalData = true, arbitrageData } = body;
    
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
      return NextResponse.json(
        { error: 'Valid ASIN is required' },
        { status: 400 }
      );
    }
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      keepa: { apiKey: process.env.KEEPA_API_KEY ? true : false }
    });
    
    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Service configuration incomplete' },
        { status: 503 }
      );
    }
    
    const supabase = getServiceRoleClient();
    
    // Check if we have recent AI analysis for this ASIN
    const { data: existingAnalysis } = await supabase
      .from('ai_deal_analysis')
      .select('*')
      .eq('asin', asin.toUpperCase())
      .eq('user_id', user.id)
      .gte('analysis_timestamp', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()) // 6 hours
      .order('analysis_timestamp', { ascending: false })
      .limit(1)
      .single();
    
    if (existingAnalysis && !body.forceRefresh) {
      // Return cached analysis if recent enough
      return NextResponse.json({
        success: true,
        data: existingAnalysis,
        fromCache: true,
        message: 'Returning cached AI analysis (last 6 hours)'
      });
    }
    
    // Initialize services
    const keepaApiKey = process.env.KEEPA_API_KEY;
    if (!keepaApiKey) {
      return NextResponse.json(
        { error: 'Keepa API not configured' },
        { status: 503 }
      );
    }
    
    const keepaApi = new KeepaComprehensiveAPI(keepaApiKey, 2); // UK domain
    const aiAnalyzer = new AIDealAnalyzer();
    
    // Fetch comprehensive Keepa data
    const keepaData = await keepaApi.getComprehensiveData(asin.toUpperCase(), {
      includePriceHistory: includeHistoricalData,
      includeOfferHistory: true,
      includeRankHistory: true,
      daysBack: includeHistoricalData ? -1 : 180, // All data or 6 months
      includeReviews: true
    });
    
    if (!keepaData) {
      return NextResponse.json(
        { error: 'Unable to fetch product data from Keepa' },
        { status: 404 }
      );
    }
    
    // Store/update comprehensive Keepa data
    await supabase
      .from('keepa_comprehensive_data')
      .upsert({
        asin: keepaData.asin,
        user_id: user.id,
        title: keepaData.title,
        brand: keepaData.brand,
        main_image: keepaData.mainImage,
        category: keepaData.category,
        review_count: keepaData.reviewCount,
        rating: keepaData.rating,
        sales_per_month: keepaData.salesPerMonth,
        current_sales_rank: keepaData.salesRank,
        sales_drops_30d: keepaData.salesDrops30d,
        sales_drops_90d: keepaData.salesDrops90d,
        sales_drops_180d: keepaData.salesDrops180d,
        sales_drops_all_time: keepaData.salesDropsAllTime,
        current_buy_price: keepaData.currentBuyPrice ? Math.round(keepaData.currentBuyPrice * 100) : null,
        buy_price_30d: keepaData.buyPrice30d ? Math.round(keepaData.buyPrice30d * 100) : null,
        buy_price_90d: keepaData.buyPrice90d ? Math.round(keepaData.buyPrice90d * 100) : null,
        buy_price_180d: keepaData.buyPrice180d ? Math.round(keepaData.buyPrice180d * 100) : null,
        buy_price_365d: keepaData.buyPrice365d ? Math.round(keepaData.buyPrice365d * 100) : null,
        avg_price_all_time: keepaData.avgPriceAllTime ? Math.round(keepaData.avgPriceAllTime * 100) : null,
        lowest_price_ever: keepaData.lowestPriceEver ? Math.round(keepaData.lowestPriceEver * 100) : null,
        highest_price_ever: keepaData.highestPriceEver ? Math.round(keepaData.highestPriceEver * 100) : null,
        current_sell_price: keepaData.currentSellPrice ? Math.round(keepaData.currentSellPrice * 100) : null,
        sell_price_30d: keepaData.sellPrice30d ? Math.round(keepaData.sellPrice30d * 100) : null,
        sell_price_180d: keepaData.sellPrice180d ? Math.round(keepaData.sellPrice180d * 100) : null,
        buy_box_price: keepaData.buyBoxPrice ? Math.round(keepaData.buyBoxPrice * 100) : null,
        buy_box_win_rate: keepaData.buyBoxWinRate,
        total_offer_count: keepaData.totalOfferCount,
        fba_offer_count: keepaData.fbaOfferCount,
        fbm_offer_count: keepaData.fbmOfferCount,
        amazon_in_stock: keepaData.amazonInStock,
        out_of_stock_percentage_30d: keepaData.outOfStockPercentage30d,
        out_of_stock_percentage_90d: keepaData.outOfStockPercentage90d,
        price_change_frequency: keepaData.priceChangeFrequency,
        review_velocity: keepaData.reviewVelocity,
        price_history: keepaData.priceHistory,
        sales_rank_history: keepaData.salesRankHistory,
        sales_rank_history_30d: keepaData.salesRankHistory30d,
        competitor_history: keepaData.competitorHistory,
        data_completeness: keepaData.dataCompleteness,
        spm_data_source: keepaData.spmDataSource,
        spm_confidence: keepaData.spmConfidence,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'asin,user_id'
      });
    
    // Perform AI analysis with OpenAI enhancement if available
    const aiAnalysis = await aiAnalyzer.analyzeComprehensively(keepaData, arbitrageData, { 
      useOpenAI: true 
    });
    
    // Store AI analysis results
    const { data: savedAnalysis, error: saveError } = await supabase
      .from('ai_deal_analysis')
      .insert({
        asin: keepaData.asin,
        user_id: user.id,
        ai_score: aiAnalysis.aiScore,
        confidence_percentage: aiAnalysis.confidence,
        deal_classification: aiAnalysis.dealType,
        sales_score: aiAnalysis.salesScore,
        price_score: aiAnalysis.priceScore,
        competition_score: aiAnalysis.competitionScore,
        opportunity_score: aiAnalysis.opportunityScore,
        risk_score: aiAnalysis.riskScore,
        predicted_price_30d: aiAnalysis.predictedPriceIn30Days,
        predicted_sales_30d: aiAnalysis.predictedSalesIn30Days,
        optimal_buy_timing: aiAnalysis.optimalBuyingWindow,
        price_trend: aiAnalysis.priceTrend,
        sales_trend: aiAnalysis.salesTrend,
        competition_trend: aiAnalysis.competitionTrend,
        current_price_percentile: aiAnalysis.currentPricePercentile,
        sales_velocity_rank: aiAnalysis.salesVelocityRank,
        top_insights: aiAnalysis.topInsights,
        warnings: aiAnalysis.warnings,
        opportunities: aiAnalysis.opportunities,
        keepa_data_snapshot: keepaData,
        arbitrage_context: arbitrageData,
        data_completeness: keepaData.dataCompleteness,
        keepa_data_source: keepaData.spmDataSource,
        keepa_confidence: keepaData.spmConfidence,
      })
      .select()
      .single();
    
    // Store OpenAI enhanced analysis if available
    if (!saveError && aiAnalysis.openaiAnalysis && savedAnalysis) {
      await supabase
        .from('openai_analysis')
        .insert({
          asin: keepaData.asin,
          user_id: user.id,
          base_ai_analysis_id: savedAnalysis.id,
          gpt_insights: aiAnalysis.openaiAnalysis.gptInsights,
          gpt_quality_score: aiAnalysis.openaiAnalysis.gptQualityScore,
          gpt_confidence: aiAnalysis.openaiAnalysis.gptConfidence,
          gpt_price_prediction: aiAnalysis.openaiAnalysis.gptPricePrediction,
          gpt_sales_prediction: aiAnalysis.openaiAnalysis.gptSalesPrediction,
          gpt_timing_recommendation: aiAnalysis.openaiAnalysis.gptTimingRecommendation,
          gpt_risks: aiAnalysis.openaiAnalysis.gptRisks,
          gpt_opportunities: aiAnalysis.openaiAnalysis.gptOpportunities,
          category_specific_insights: aiAnalysis.openaiAnalysis.categorySpecificInsights,
          seasonal_factors: aiAnalysis.openaiAnalysis.seasonalFactors,
          market_context_analysis: aiAnalysis.openaiAnalysis.marketContextAnalysis,
          score_adjustment: aiAnalysis.openaiAnalysis.scoreAdjustment,
          adjustment_reason: aiAnalysis.openaiAnalysis.adjustmentReason,
          prompt_tokens: aiAnalysis.openaiAnalysis.promptTokens,
          completion_tokens: aiAnalysis.openaiAnalysis.completionTokens,
          estimated_cost: aiAnalysis.openaiAnalysis.estimatedCost,
        });
    }
    
    if (saveError) {
      console.error('Error saving AI analysis:', saveError);
      // Still return the analysis even if save failed
      return NextResponse.json({
        success: true,
        data: aiAnalysis,
        warning: 'Analysis completed but save failed'
      });
    }
    
    // Also save to deal history for tracking
    if (arbitrageData) {
      await supabase
        .from('deal_analysis_history')
        .insert({
          asin: keepaData.asin,
          user_id: user.id,
          buy_price: arbitrageData.buyPrice,
          sell_price: arbitrageData.sellPrice,
          profit: arbitrageData.profit,
          roi: arbitrageData.roi,
          estimated_sales: keepaData.salesPerMonth,
          fba_offers: keepaData.fbaOfferCount,
          current_price: keepaData.currentBuyPrice,
          target_price: arbitrageData.sellPrice,
          price_gap: arbitrageData.sellPrice - keepaData.currentBuyPrice!,
          deal_score: aiAnalysis.aiScore,
          deal_rating: aiAnalysis.dealType,
          analysis_date: new Date().toISOString()
        });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...aiAnalysis,
        id: savedAnalysis.id,
        analysisTimestamp: savedAnalysis.analysis_timestamp
      },
      fromCache: false,
      tokensUsed: KeepaComprehensiveAPI.calculateComprehensiveTokenCost(1, {
        includePriceHistory: includeHistoricalData,
        includeOfferHistory: true,
        includeRankHistory: true,
        daysBack: includeHistoricalData ? -1 : 180,
        includeReviews: true
      })
    });
    
  } catch (error) {
    console.error('AI Deal Analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}