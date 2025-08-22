import OpenAI from 'openai';
import { KeepaComprehensiveData } from '@/lib/keepa-comprehensive-api';
import { AIAnalysisResult } from './ai-deal-analyzer';
import { openaiCache } from './openai-cache';
import { openaiRateLimiter } from './openai-rate-limiter';

export interface OpenAIEnhancedAnalysis {
  // Enhanced insights from GPT
  gptInsights: string[];
  gptQualityScore: number; // 1-10 scale
  gptConfidence: number; // 0-100%
  
  // Predictions and recommendations
  gptPricePrediction: string;
  gptSalesPrediction: string;
  gptTimingRecommendation: string;
  gptRisks: string[];
  gptOpportunities: string[];
  
  // Context-aware analysis
  categorySpecificInsights: string[];
  seasonalFactors: string[];
  marketContextAnalysis: string;
  
  // Scoring adjustments
  scoreAdjustment: number; // -100 to +100 adjustment to base score
  adjustmentReason: string;
  
  // API usage tracking
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}

interface OpenAIAnalysisRequest {
  productTitle: string;
  category: string;
  currentPrice: number;
  pricePercentile: number;
  monthlySales: number;
  salesTrend: string;
  competitorCount: number;
  roi: number;
  profit: number;
  baseAIScore: number;
  dealClassification: string;
}

export class OpenAIDealEnhancer {
  private openai: OpenAI;
  private readonly MODEL = 'gpt-3.5-turbo';
  private readonly MAX_TOKENS = 800;
  
  constructor(apiKey?: string) {
    if (!apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY!,
    });
  }
  
  async enhanceAnalysis(
    keepaData: KeepaComprehensiveData,
    baseAnalysis: AIAnalysisResult,
    arbitrageData?: {
      buyPrice: number;
      sellPrice: number;
      profit: number;
      roi: number;
    }
  ): Promise<OpenAIEnhancedAnalysis | null> {
    try {
      const currentPrice = keepaData.currentBuyPrice || 0;
      const competitorCount = keepaData.fbaOfferCount || 0;
      const monthlySales = keepaData.salesPerMonth || 0;
      
      // Check cache first
      const cachedResult = openaiCache.get(keepaData.asin, currentPrice, competitorCount, monthlySales);
      if (cachedResult) {
        console.log(`[OpenAI] Using cached analysis for ${keepaData.asin}`);
        return cachedResult;
      }
      
      // Check rate limiting
      if (!openaiRateLimiter.canMakeRequest()) {
        const waitTime = openaiRateLimiter.getTimeUntilNextRequest();
        console.log(`[OpenAI] Rate limited, waiting ${waitTime}ms for ${keepaData.asin}`);
        
        // Wait if it's a reasonable time, otherwise skip
        if (waitTime < 5000) { // Only wait up to 5 seconds
          await openaiRateLimiter.waitForAvailableSlot();
        } else {
          console.log(`[OpenAI] Skipping analysis for ${keepaData.asin} due to rate limiting`);
          return null;
        }
      }
      
      // Record the request
      openaiRateLimiter.recordRequest();
      
      // Prepare the analysis request
      const request: OpenAIAnalysisRequest = {
        productTitle: keepaData.title || 'Unknown Product',
        category: keepaData.category || 'Unknown',
        currentPrice: currentPrice,
        pricePercentile: baseAnalysis.currentPricePercentile,
        monthlySales: monthlySales,
        salesTrend: baseAnalysis.salesTrend,
        competitorCount: competitorCount,
        roi: arbitrageData?.roi || 0,
        profit: arbitrageData?.profit || 0,
        baseAIScore: baseAnalysis.aiScore,
        dealClassification: baseAnalysis.dealType,
      };
      
      // Generate the analysis prompt
      const prompt = this.createAnalysisPrompt(request);
      
      console.log(`[OpenAI] Making API call for ${keepaData.asin}`);
      
      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.MAX_TOKENS,
        temperature: 0.3, // Lower temperature for more consistent analysis
        response_format: { type: 'json_object' },
      });
      
      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }
      
      // Parse and validate the JSON response
      const parsed = JSON.parse(response);
      const enhancedAnalysis = this.validateAndFormatResponse(parsed);
      
      // Add API usage tracking
      enhancedAnalysis.promptTokens = completion.usage?.prompt_tokens || 0;
      enhancedAnalysis.completionTokens = completion.usage?.completion_tokens || 0;
      enhancedAnalysis.estimatedCost = this.calculateCost(
        enhancedAnalysis.promptTokens,
        enhancedAnalysis.completionTokens
      );
      
      // Cache the result for future use
      openaiCache.set(keepaData.asin, currentPrice, competitorCount, monthlySales, enhancedAnalysis);
      
      console.log(`[OpenAI] Analysis completed for ${keepaData.asin}, cost: $${enhancedAnalysis.estimatedCost.toFixed(4)}`);
      
      return enhancedAnalysis;
      
    } catch (error) {
      console.error('OpenAI enhancement failed:', error);
      return null; // Gracefully fail - system can still use base analysis
    }
  }
  
  private getSystemPrompt(): string {
    return `You are an expert Amazon arbitrage analyst with deep knowledge of e-commerce trends, seasonal patterns, and market dynamics. 

Your role is to enhance rule-based deal scoring with contextual intelligence, pattern recognition, and market expertise that algorithms might miss.

Focus on:
- Category-specific insights (Electronics seasonality, Home & Kitchen trends, etc.)
- Market timing opportunities (Q4 boost, back-to-school, etc.)  
- Hidden risks (product lifecycle, brand issues, regulatory changes)
- Competition dynamics (why sellers entered/exited)
- Price psychology and market sentiment

Always respond with a JSON object matching the specified format. Be specific, actionable, and confident in your assessments.`;
  }
  
  private createAnalysisPrompt(data: OpenAIAnalysisRequest): string {
    return `Analyze this Amazon arbitrage opportunity with your market expertise:

PRODUCT DETAILS:
- Title: "${data.productTitle}"
- Category: ${data.category}
- Current Buy Price: £${data.currentPrice.toFixed(2)}
- Price Position: ${data.pricePercentile}th percentile (${this.getPricePositionText(data.pricePercentile)})

MARKET METRICS:
- Monthly Sales: ${data.monthlySales || 'Unknown'}
- Sales Trend: ${data.salesTrend}
- FBA Competitors: ${data.competitorCount}

ARBITRAGE OPPORTUNITY:
- ROI: ${data.roi.toFixed(1)}%
- Profit: £${data.profit.toFixed(2)}
- Base AI Score: ${data.baseAIScore}/1000 (${data.dealClassification})

ANALYSIS REQUIRED:
Provide contextual insights that rule-based algorithms miss. Consider seasonality, category trends, competition behavior, and market timing.

Respond with JSON:
{
  "gptInsights": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "gptQualityScore": 8.5,
  "gptConfidence": 85,
  "gptPricePrediction": "Likely to increase 10-15% due to...",
  "gptSalesPrediction": "Sales may decline due to...",
  "gptTimingRecommendation": "Buy now - competition exodus creates opportunity",
  "gptRisks": ["Risk 1", "Risk 2"],
  "gptOpportunities": ["Opportunity 1", "Opportunity 2"],
  "categorySpecificInsights": ["Category insight 1", "Category insight 2"],
  "seasonalFactors": ["Q4 boost expected", "Back-to-school demand"],
  "marketContextAnalysis": "Market context paragraph...",
  "scoreAdjustment": 15,
  "adjustmentReason": "Strong seasonal uptick expected in category"
}`;
  }
  
  private getPricePositionText(percentile: number): string {
    if (percentile <= 20) return 'near historic low';
    if (percentile <= 40) return 'below average';
    if (percentile <= 60) return 'average';
    if (percentile <= 80) return 'above average';
    return 'near historic high';
  }
  
  private validateAndFormatResponse(parsed: any): OpenAIEnhancedAnalysis {
    // Ensure all required fields are present with defaults
    return {
      gptInsights: Array.isArray(parsed.gptInsights) ? parsed.gptInsights.slice(0, 5) : [],
      gptQualityScore: Math.min(10, Math.max(1, parsed.gptQualityScore || 5)),
      gptConfidence: Math.min(100, Math.max(0, parsed.gptConfidence || 50)),
      
      gptPricePrediction: parsed.gptPricePrediction || 'No prediction available',
      gptSalesPrediction: parsed.gptSalesPrediction || 'No prediction available',
      gptTimingRecommendation: parsed.gptTimingRecommendation || 'Monitor market conditions',
      gptRisks: Array.isArray(parsed.gptRisks) ? parsed.gptRisks.slice(0, 3) : [],
      gptOpportunities: Array.isArray(parsed.gptOpportunities) ? parsed.gptOpportunities.slice(0, 3) : [],
      
      categorySpecificInsights: Array.isArray(parsed.categorySpecificInsights) ? parsed.categorySpecificInsights.slice(0, 3) : [],
      seasonalFactors: Array.isArray(parsed.seasonalFactors) ? parsed.seasonalFactors.slice(0, 3) : [],
      marketContextAnalysis: parsed.marketContextAnalysis || 'No market context provided',
      
      scoreAdjustment: Math.min(100, Math.max(-100, parsed.scoreAdjustment || 0)),
      adjustmentReason: parsed.adjustmentReason || 'No adjustment needed',
      
      // Will be filled by the calling function
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
    };
  }
  
  private calculateCost(promptTokens: number, completionTokens: number): number {
    // GPT-3.5-turbo pricing (as of 2024)
    const PROMPT_PRICE_PER_1K = 0.0015; // $0.0015 per 1K prompt tokens
    const COMPLETION_PRICE_PER_1K = 0.002; // $0.002 per 1K completion tokens
    
    const promptCost = (promptTokens / 1000) * PROMPT_PRICE_PER_1K;
    const completionCost = (completionTokens / 1000) * COMPLETION_PRICE_PER_1K;
    
    return promptCost + completionCost;
  }
  
  // Static method to check if OpenAI is available
  static isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';
  }
  
  // Static method to estimate monthly cost
  static estimateMonthlyCost(analysesPerMonth: number): number {
    // Estimate average tokens per analysis
    const avgPromptTokens = 600;
    const avgCompletionTokens = 400;
    
    const costPerAnalysis = new OpenAIDealEnhancer().calculateCost(avgPromptTokens, avgCompletionTokens);
    return analysesPerMonth * costPerAnalysis;
  }
}