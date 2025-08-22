import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest } from '@/lib/auth';
import { getServiceRoleClient } from '@/lib/supabase-server';
import { KeepaComprehensiveAPI } from '@/lib/keepa-comprehensive-api';
import { AIDealAnalyzer } from '@/services/ai-deal-analyzer';
import { checkEnvVars } from '@/lib/env-check';

interface BatchAnalysisRequest {
  asins: string[];
  includeHistoricalData?: boolean;
  priorityMetrics?: string[];
  maxConcurrent?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Parse request body
    const body: BatchAnalysisRequest = await request.json();
    const { 
      asins, 
      includeHistoricalData = false, // Default to false for batch to save tokens
      maxConcurrent = 5 
    } = body;
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: 'ASINs array is required' },
        { status: 400 }
      );
    }
    
    if (asins.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 ASINs allowed per batch' },
        { status: 400 }
      );
    }
    
    // Validate ASINs
    const validAsins = asins
      .filter(asin => /^[A-Z0-9]{10}$/i.test(asin))
      .map(asin => asin.toUpperCase());
    
    if (validAsins.length === 0) {
      return NextResponse.json(
        { error: 'No valid ASINs provided' },
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
    const keepaApiKey = process.env.KEEPA_API_KEY!;
    const keepaApi = new KeepaComprehensiveAPI(keepaApiKey, 2);
    const aiAnalyzer = new AIDealAnalyzer();
    
    // Check for existing recent analyses
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: existingAnalyses } = await supabase
      .from('ai_deal_analysis')
      .select('asin, ai_score, deal_classification, analysis_timestamp, confidence_percentage')
      .eq('user_id', user.id)
      .in('asin', validAsins)
      .gte('analysis_timestamp', sixHoursAgo);
    
    const existingAsinMap = new Map(
      (existingAnalyses || []).map(analysis => [analysis.asin, analysis])
    );
    
    const asinsToAnalyze = validAsins.filter(asin => !existingAsinMap.has(asin));
    
    const results = {
      total: validAsins.length,
      analyzed: asinsToAnalyze.length,
      fromCache: validAsins.length - asinsToAnalyze.length,
      analyses: [] as any[],
      errors: [] as any[],
      tokensUsed: 0
    };
    
    // Add cached results
    validAsins.forEach(asin => {
      if (existingAsinMap.has(asin)) {
        results.analyses.push({
          asin,
          ...existingAsinMap.get(asin),
          fromCache: true
        });
      }
    });
    
    if (asinsToAnalyze.length === 0) {
      return NextResponse.json({
        success: true,
        data: results,
        message: 'All analyses retrieved from cache'
      });
    }
    
    // Calculate token cost
    const tokenCost = KeepaComprehensiveAPI.calculateComprehensiveTokenCost(
      asinsToAnalyze.length,
      {
        includePriceHistory: includeHistoricalData,
        includeOfferHistory: true,
        includeRankHistory: true,
        daysBack: 180, // 6 months for batch
        includeReviews: false // Skip reviews for batch to save tokens
      }
    );
    
    results.tokensUsed = tokenCost;
    
    try {
      // Fetch comprehensive Keepa data in batches
      const keepaData = await keepaApi.getBatchComprehensiveData(
        asinsToAnalyze,
        {
          includePriceHistory: includeHistoricalData,
          includeOfferHistory: true,
          includeRankHistory: true,
          daysBack: 180,
          includeReviews: false
        }
      );
      
      // Process in controlled concurrency
      const chunks = [];
      for (let i = 0; i < keepaData.length; i += maxConcurrent) {
        chunks.push(keepaData.slice(i, i + maxConcurrent));
      }
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (data) => {
          try {
            // Perform AI analysis with OpenAI enhancement
            const aiAnalysis = await aiAnalyzer.analyzeComprehensively(data, undefined, { 
              useOpenAI: true 
            });
            
            // Store comprehensive Keepa data
            await supabase
              .from('keepa_comprehensive_data')
              .upsert({
                asin: data.asin,
                user_id: user.id,
                title: data.title,
                brand: data.brand,
                main_image: data.mainImage,
                category: data.category,
                review_count: data.reviewCount,
                rating: data.rating,
                sales_per_month: data.salesPerMonth,
                current_sales_rank: data.salesRank,
                sales_drops_30d: data.salesDrops30d,
                sales_drops_90d: data.salesDrops90d,
                sales_drops_180d: data.salesDrops180d,
                sales_drops_all_time: data.salesDropsAllTime,
                current_buy_price: data.currentBuyPrice ? Math.round(data.currentBuyPrice * 100) : null,
                buy_price_30d: data.buyPrice30d ? Math.round(data.buyPrice30d * 100) : null,
                buy_price_90d: data.buyPrice90d ? Math.round(data.buyPrice90d * 100) : null,
                buy_price_180d: data.buyPrice180d ? Math.round(data.buyPrice180d * 100) : null,
                buy_price_365d: data.buyPrice365d ? Math.round(data.buyPrice365d * 100) : null,
                avg_price_all_time: data.avgPriceAllTime ? Math.round(data.avgPriceAllTime * 100) : null,
                lowest_price_ever: data.lowestPriceEver ? Math.round(data.lowestPriceEver * 100) : null,
                highest_price_ever: data.highestPriceEver ? Math.round(data.highestPriceEver * 100) : null,
                current_sell_price: data.currentSellPrice ? Math.round(data.currentSellPrice * 100) : null,
                sell_price_30d: data.sellPrice30d ? Math.round(data.sellPrice30d * 100) : null,
                sell_price_180d: data.sellPrice180d ? Math.round(data.sellPrice180d * 100) : null,
                buy_box_price: data.buyBoxPrice ? Math.round(data.buyBoxPrice * 100) : null,
                buy_box_win_rate: data.buyBoxWinRate,
                total_offer_count: data.totalOfferCount,
                fba_offer_count: data.fbaOfferCount,
                fbm_offer_count: data.fbmOfferCount,
                amazon_in_stock: data.amazonInStock,
                out_of_stock_percentage_30d: data.outOfStockPercentage30d,
                out_of_stock_percentage_90d: data.outOfStockPercentage90d,
                price_change_frequency: data.priceChangeFrequency,
                review_velocity: data.reviewVelocity,
                price_history: data.priceHistory,
                sales_rank_history: data.salesRankHistory,
                sales_rank_history_30d: data.salesRankHistory30d,
                competitor_history: data.competitorHistory,
                data_completeness: data.dataCompleteness,
                spm_data_source: data.spmDataSource,
                spm_confidence: data.spmConfidence,
                last_updated: new Date().toISOString()
              }, {
                onConflict: 'asin,user_id'
              });
            
            // Store AI analysis
            const { data: savedAnalysis } = await supabase
              .from('ai_deal_analysis')
              .insert({
                asin: data.asin,
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
                keepa_data_snapshot: data,
                data_completeness: data.dataCompleteness,
                keepa_data_source: data.spmDataSource,
                keepa_confidence: data.spmConfidence,
              })
              .select()
              .single();
            
            return {
              asin: data.asin,
              aiScore: aiAnalysis.aiScore,
              dealType: aiAnalysis.dealType,
              confidence: aiAnalysis.confidence,
              currentPricePercentile: aiAnalysis.currentPricePercentile,
              salesVelocityRank: aiAnalysis.salesVelocityRank,
              priceTrend: aiAnalysis.priceTrend,
              salesTrend: aiAnalysis.salesTrend,
              competitionTrend: aiAnalysis.competitionTrend,
              topInsights: aiAnalysis.topInsights.slice(0, 2), // Top 2 insights for batch
              warnings: aiAnalysis.warnings.slice(0, 2),
              analysisTimestamp: savedAnalysis?.analysis_timestamp,
              fromCache: false
            };
            
          } catch (error) {
            console.error(`Error analyzing ASIN ${data.asin}:`, error);
            return {
              asin: data.asin,
              error: error instanceof Error ? error.message : 'Analysis failed'
            };
          }
        });
        
        const chunkResults = await Promise.allSettled(chunkPromises);
        
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            if ('error' in result.value) {
              results.errors.push(result.value);
            } else {
              results.analyses.push(result.value);
            }
          } else {
            results.errors.push({
              asin: chunk[index]?.asin || 'unknown',
              error: 'Promise rejected'
            });
          }
        });
        
        // Rate limiting between chunks
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
    } catch (error) {
      console.error('Batch analysis error:', error);
      return NextResponse.json(
        { 
          error: 'Batch analysis failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          partialResults: results
        },
        { status: 500 }
      );
    }
    
    // Sort results by AI score (highest first)
    results.analyses.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
    
    return NextResponse.json({
      success: true,
      data: results,
      summary: {
        totalAnalyzed: results.total,
        newAnalyses: results.analyzed,
        fromCache: results.fromCache,
        errors: results.errors.length,
        tokensUsed: results.tokensUsed,
        avgScore: results.analyses.length > 0 ? 
          Math.round(results.analyses.reduce((sum, a) => sum + (a.aiScore || 0), 0) / results.analyses.length) : 0,
        topDeals: results.analyses.filter(a => a.aiScore >= 700).length,
        goodDeals: results.analyses.filter(a => a.aiScore >= 500 && a.aiScore < 700).length
      }
    });
    
  } catch (error) {
    console.error('Batch AI Analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}