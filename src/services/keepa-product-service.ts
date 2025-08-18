import { KeepaAPI, KeepaProductStats, KeepaGraphOptions } from '@/lib/keepa-api';
import { KeepaPersistentRateLimiter } from '@/lib/keepa-persistent-rate-limiter';
import { createClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/supabase-server';

export interface KeepaEnrichedProduct {
  asin: string;
  keepaData: KeepaProductStats | null;
  graphUrl: string | null;
  tokensUsed: number;
  error?: string;
}

export class KeepaProductService {
  private keepaApi: KeepaAPI;
  private rateLimiter: KeepaPersistentRateLimiter;
  private supabase: ReturnType<typeof getServiceRoleClient>;
  private cacheExpiryHours = 24; // Cache Keepa data for 24 hours
  
  constructor(apiKey: string, userId: string, domain: number = 2) {
    this.keepaApi = new KeepaAPI(apiKey, domain);
    this.rateLimiter = new KeepaPersistentRateLimiter(userId);
    this.supabase = getServiceRoleClient();
  }
  
  /**
   * Fetch Keepa data for a single ASIN with rate limiting and caching
   */
  async enrichProduct(asin: string, includeGraph: boolean = true): Promise<KeepaEnrichedProduct> {
    try {
      // Check cache first
      const cachedData = await this.getCachedKeepaData(asin);
      if (cachedData) {
        return {
          asin,
          keepaData: cachedData,
          graphUrl: includeGraph ? this.keepaApi.generateGraphUrl(asin) : null,
          tokensUsed: 0, // No tokens used for cached data
        };
      }
      
      // Calculate token cost (1 for product data, 1 for graph if included)
      const tokenCost = includeGraph ? 2 : 1;
      
      // Wait for tokens if needed
      await this.rateLimiter.consumeTokens(tokenCost);
      
      // Fetch product stats from Keepa
      const keepaData = await this.keepaApi.getProductWithStats(asin);
      
      if (!keepaData) {
        return {
          asin,
          keepaData: null,
          graphUrl: null,
          tokensUsed: tokenCost,
          error: 'Product not found in Keepa',
        };
      }
      
      // Generate graph URL
      const graphUrl = includeGraph ? this.keepaApi.generateGraphUrl(asin) : null;
      
      // Cache the data in database
      await this.cacheKeepaData(asin, keepaData, graphUrl);
      
      return {
        asin,
        keepaData,
        graphUrl,
        tokensUsed: tokenCost,
      };
    } catch (error) {
      console.error(`Error enriching product ${asin}:`, error);
      return {
        asin,
        keepaData: null,
        graphUrl: null,
        tokensUsed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Batch process multiple ASINs with rate limiting
   */
  async enrichProducts(
    asins: string[],
    includeGraph: boolean = true,
    onProgress?: (processed: number, total: number, currentAsin: string) => void
  ): Promise<KeepaEnrichedProduct[]> {
    const results: KeepaEnrichedProduct[] = [];
    const uniqueAsins = [...new Set(asins)];
    
    // Check which ASINs need fresh data
    const asinsNeedingUpdate: string[] = [];
    const cachedResults: KeepaEnrichedProduct[] = [];
    
    for (const asin of uniqueAsins) {
      const cachedData = await this.getCachedKeepaData(asin);
      if (cachedData) {
        cachedResults.push({
          asin,
          keepaData: cachedData,
          graphUrl: includeGraph ? this.keepaApi.generateGraphUrl(asin) : null,
          tokensUsed: 0,
        });
      } else {
        asinsNeedingUpdate.push(asin);
      }
    }
    
    // Add cached results
    results.push(...cachedResults);
    
    if (asinsNeedingUpdate.length === 0) {
      return results;
    }
    
    // Calculate total token cost
    const tokenCostPerAsin = includeGraph ? 2 : 1;
    const totalTokens = asinsNeedingUpdate.length * tokenCostPerAsin;
    
    // Check if we have enough tokens or need to wait
    const waitTime = await this.rateLimiter.getWaitTimeForTokens(totalTokens);
    if (waitTime > 0) {
      console.log(`Waiting ${Math.ceil(waitTime / 1000)}s for ${totalTokens} Keepa tokens...`);
    }
    
    // Process in batches (Keepa allows up to 100 ASINs per request)
    const batchSize = 100;
    let processedCount = cachedResults.length;
    
    for (let i = 0; i < asinsNeedingUpdate.length; i += batchSize) {
      const batch = asinsNeedingUpdate.slice(i, i + batchSize);
      const batchTokenCost = batch.length * tokenCostPerAsin;
      
      // Consume tokens for this batch
      await this.rateLimiter.consumeTokens(batchTokenCost);
      
      try {
        // Fetch batch data from Keepa
        const batchStats = await this.keepaApi.getBatchProductStats(batch);
        
        // Process each result
        for (const stats of batchStats) {
          const graphUrl = includeGraph ? this.keepaApi.generateGraphUrl(stats.asin) : null;
          
          // Cache the data
          await this.cacheKeepaData(stats.asin, stats, graphUrl);
          
          results.push({
            asin: stats.asin,
            keepaData: stats,
            graphUrl,
            tokensUsed: tokenCostPerAsin,
          });
          
          processedCount++;
          if (onProgress) {
            onProgress(processedCount, uniqueAsins.length, stats.asin);
          }
        }
        
        // Handle ASINs not found in Keepa
        const foundAsins = new Set(batchStats.map(s => s.asin));
        for (const asin of batch) {
          if (!foundAsins.has(asin)) {
            results.push({
              asin,
              keepaData: null,
              graphUrl: null,
              tokensUsed: tokenCostPerAsin,
              error: 'Product not found in Keepa',
            });
            
            processedCount++;
            if (onProgress) {
              onProgress(processedCount, uniqueAsins.length, asin);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing batch:`, error);
        
        // Add error results for failed batch
        for (const asin of batch) {
          results.push({
            asin,
            keepaData: null,
            graphUrl: null,
            tokensUsed: 0,
            error: error instanceof Error ? error.message : 'Batch processing failed',
          });
          
          processedCount++;
          if (onProgress) {
            onProgress(processedCount, uniqueAsins.length, asin);
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Get cached Keepa data from database
   */
  private async getCachedKeepaData(asin: string): Promise<KeepaProductStats | null> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - this.cacheExpiryHours);
      
      const { data, error } = await this.supabase
        .from('products')
        .select(`
          asin,
          product_name,
          brand,
          image_link,
          current_sales_rank,
          category,
          keepa_sales_drops_30d,
          keepa_sales_drops_90d,
          keepa_estimated_sales,
          keepa_buy_box_win_rate,
          keepa_competitor_count,
          keepa_spm_data_source,
          keepa_spm_confidence,
          keepa_last_updated
        `)
        .eq('asin', asin)
        .gte('keepa_last_updated', cutoffTime.toISOString())
        .single();
      
      if (error || !data || !data.keepa_last_updated) {
        return null;
      }
      
      // Convert database format to KeepaProductStats
      // Use cached SPM data quality information
      const salesDrops30d = data.keepa_sales_drops_30d || 0;
      const salesDrops90d = data.keepa_sales_drops_90d || 0;
      const estimatedSales = data.keepa_estimated_sales || 0;
      
      // Use stored data quality values or fall back to calculated ones
      const spmDataSource = data.keepa_spm_data_source as 'none' | '30day' | '90day' || 
                          (salesDrops90d > 0 && estimatedSales > 0 ? '90day' : 
                           salesDrops30d > 0 && estimatedSales > 0 ? '30day' : 'none');
      
      const spmConfidence = data.keepa_spm_confidence as 'none' | 'low' | 'medium' | 'high' || 
                          (spmDataSource === '90day' ? 'high' : 
                           spmDataSource === '30day' ? 'medium' : 'none');
      
      return {
        asin: data.asin,
        title: data.product_name || '',
        brand: data.brand || '',
        mainImage: data.image_link || '',
        salesRank: data.current_sales_rank,
        salesRankCategory: data.category || null,
        salesDrops30d: salesDrops30d,
        salesDrops90d: salesDrops90d,
        estimatedMonthlySales: estimatedSales > 0 ? estimatedSales : null,
        spmDataSource,
        spmConfidence,
        buyBoxWinRate: data.keepa_buy_box_win_rate,
        competitorCount: data.keepa_competitor_count || 0,
        currentPrice: null, // Not stored in cache
        avgPrice30d: null,
        minPrice30d: null,
        maxPrice30d: null,
        outOfStockPercentage: null,
      };
    } catch (error) {
      console.error('Error fetching cached Keepa data:', error);
      return null;
    }
  }
  
  /**
   * Cache Keepa data in database
   */
  private async cacheKeepaData(
    asin: string,
    keepaData: KeepaProductStats,
    graphUrl: string | null
  ): Promise<void> {
    try {
      const updateData: any = {
        keepa_sales_drops_30d: keepaData.salesDrops30d,
        keepa_sales_drops_90d: keepaData.salesDrops90d,
        keepa_estimated_sales: keepaData.estimatedMonthlySales,
        keepa_buy_box_win_rate: keepaData.buyBoxWinRate,
        keepa_competitor_count: keepaData.competitorCount,
        keepa_graph_url: graphUrl,
        keepa_last_updated: new Date().toISOString(),
        keepa_spm_data_source: keepaData.spmDataSource,
        keepa_spm_confidence: keepaData.spmConfidence,
        sales_per_month: keepaData.estimatedMonthlySales, // Also update the main sales field
      };
      
      // Update if product exists, or create minimal entry
      const { error } = await this.supabase
        .from('products')
        .upsert({
          asin,
          product_name: keepaData.title,
          brand: keepaData.brand,
          image_link: keepaData.mainImage,
          current_sales_rank: keepaData.salesRank,
          category: keepaData.salesRankCategory,
          ...updateData,
        }, {
          onConflict: 'asin',
        });
      
      if (error) {
        console.error('Error caching Keepa data:', error);
      }
    } catch (error) {
      console.error('Error caching Keepa data:', error);
    }
  }
  
  /**
   * Get current token status
   */
  async getTokenStatus(): Promise<{
    availableTokens: number;
    maxTokens: number;
    tokensPerMinute: number;
    nextRefillIn: number;
  }> {
    return this.rateLimiter.getStatus();
  }
  
  /**
   * Estimate time to process ASINs
   */
  async estimateProcessingTime(asinCount: number, includeGraph: boolean = true): Promise<{
    tokensNeeded: number;
    availableTokens: number;
    waitTimeMs: number;
    estimatedTotalTimeMs: number;
  }> {
    const tokensPerAsin = includeGraph ? 2 : 1;
    const tokensNeeded = asinCount * tokensPerAsin;
    const availableTokens = await this.rateLimiter.getAvailableTokens();
    const waitTimeMs = await this.rateLimiter.getWaitTimeForTokens(tokensNeeded);
    
    // Estimate processing time (API calls + overhead)
    const apiCallTimePerBatch = 2000; // 2 seconds per batch
    const batchCount = Math.ceil(asinCount / 100);
    const estimatedTotalTimeMs = waitTimeMs + (batchCount * apiCallTimePerBatch);
    
    return {
      tokensNeeded,
      availableTokens,
      waitTimeMs,
      estimatedTotalTimeMs,
    };
  }
}