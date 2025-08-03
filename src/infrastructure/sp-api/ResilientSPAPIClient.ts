import { injectable, inject } from 'tsyringe';
import { TOKENS } from '@/infrastructure/container';
import type { ICacheService } from '@/domain/interfaces/ICacheService';
import { EnhancedSPAPIRateLimiter } from './EnhancedRateLimiter';
import { SPAPIQuotaManager } from './QuotaManager';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{
    identifier: string;
    error: Error;
  }>;
}

@injectable()
export class ResilientSPAPIClient {
  private competitivePricingClient: SPAPICompetitivePricingClient;
  private productFeesClient: SPAPIProductFeesClient;
  private quotaManager: SPAPIQuotaManager;
  private rateLimiter: EnhancedSPAPIRateLimiter;
  
  constructor(
    @inject(TOKENS.CacheService) private cacheService: ICacheService
  ) {
    // Initialize with required config
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION || 'eu-west-1'
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const
    };
    
    this.competitivePricingClient = new SPAPICompetitivePricingClient(credentials, config);
    this.productFeesClient = new SPAPIProductFeesClient(credentials, config);
    this.quotaManager = new SPAPIQuotaManager();
    this.rateLimiter = new EnhancedSPAPIRateLimiter(this.quotaManager);
  }

  async getCompetitivePricingBatch(
    asins: string[],
    marketplaceId: string
  ): Promise<BatchResult<any>> {
    const results: BatchResult<any> = {
      successful: [],
      failed: []
    };

    // Check cache first
    const cacheKey = `pricing:${marketplaceId}:${asins.sort().join(',')}`;
    const cached = await this.cacheService.get<any[]>(cacheKey);
    if (cached) {
      console.log(`[Cache] Hit for ${asins.length} ASINs`);
      return { successful: cached, failed: [] };
    }

    // Split into batches of 10 (more conservative than 20)
    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < asins.length; i += batchSize) {
      batches.push(asins.slice(i, i + batchSize));
    }

    console.log(`[ResilientClient] Processing ${batches.length} batches for ${asins.length} ASINs`);

    // Process batches with controlled concurrency
    const concurrency = 1; // Sequential processing to avoid quota issues
    
    for (let i = 0; i < batches.length; i += concurrency) {
      const batchPromises = batches
        .slice(i, i + concurrency)
        .map(async (batch, index) => {
          const batchNum = i + index + 1;
          console.log(`[ResilientClient] Processing batch ${batchNum}/${batches.length} with ${batch.length} ASINs`);
          
          try {
            const result = await this.rateLimiter.executeWithRetry(
              'getCompetitivePricing',
              async () => {
                // Add delay between batches to be extra cautious
                if (batchNum > 1) {
                  const delayMs = 5000; // 5 second delay between batches
                  console.log(`[ResilientClient] Waiting ${delayMs}ms before batch ${batchNum}`);
                  await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                
                return await this.competitivePricingClient.getCompetitivePricing(
                  batch,
                  marketplaceId
                );
              }
            );
            
            results.successful.push(...result);
            console.log(`[ResilientClient] Batch ${batchNum} successful`);
          } catch (error: any) {
            console.error(`[ResilientClient] Batch ${batchNum} failed:`, error.message);
            
            // Record individual ASIN failures
            batch.forEach(asin => {
              results.failed.push({
                identifier: asin,
                error: error
              });
            });
          }
        });

      await Promise.all(batchPromises);
    }

    // Cache successful results
    if (results.successful.length > 0) {
      await this.cacheService.set(cacheKey, results.successful, 3600); // Cache for 1 hour
    }

    return results;
  }

  async getFeesEstimate(
    asin: string,
    price: number,
    marketplaceId: string
  ): Promise<any> {
    const cacheKey = `fees:${marketplaceId}:${asin}:${price}`;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.rateLimiter.executeWithRetry(
        'getMyFeesEstimate',
        async () => {
          return await this.productFeesClient.getMyFeesEstimates(
            [{
              idType: 'ASIN' as const,
              idValue: asin,
              priceToEstimateFees: {
                listingPrice: {
                  amount: price,
                  currencyCode: 'EUR'
                }
              },
              marketplaceId
            }]
          );
        }
      );

      // Extract the first result from batch response
      const feeEstimate = result[0];
      
      if (!feeEstimate || !feeEstimate.feesEstimate) {
        throw new Error('No fees estimate available');
      }
      
      // Calculate fees from fee details
      let referralFee = 0;
      let fbaFee = 0;
      let totalFees = 0;
      
      if (feeEstimate.feesEstimate.totalFeesEstimate) {
        totalFees = feeEstimate.feesEstimate.totalFeesEstimate.amount || 0;
      }
      
      if (feeEstimate.feesEstimate.feeDetailList) {
        for (const fee of feeEstimate.feesEstimate.feeDetailList) {
          if (fee.feeType === 'ReferralFee') {
            referralFee = fee.feeAmount.amount || 0;
          } else if (fee.feeType === 'FBAFees' || fee.feeType === 'FulfillmentFees') {
            fbaFee += fee.feeAmount.amount || 0;
          }
        }
      }
      
      const formattedResult = {
        referralFee,
        fbaFee,
        totalFees: totalFees || (referralFee + fbaFee)
      };
      
      // Cache for 24 hours (fees don't change often)
      await this.cacheService.set(cacheKey, formattedResult, 86400);
      
      return formattedResult;
    } catch (error: any) {
      console.error(`[ResilientClient] Fees estimate failed for ${asin}:`, error.message);
      
      // Return estimated fees as fallback
      return {
        referralFee: price * 0.15,  // 15% estimated
        fbaFee: 3,                   // €3 estimated
        totalFees: price * 0.15 + 3
      };
    }
  }

  async getCompetitivePricingForMarketplaces(
    asins: string[],
    marketplaceIds: string[]
  ): Promise<Map<string, BatchResult<any>>> {
    const results = new Map<string, BatchResult<any>>();
    
    // Process marketplaces sequentially to avoid overwhelming the API
    for (const marketplaceId of marketplaceIds) {
      console.log(`[ResilientClient] Fetching pricing for marketplace ${marketplaceId}`);
      
      const marketplaceResult = await this.getCompetitivePricingBatch(
        asins,
        marketplaceId
      );
      
      results.set(marketplaceId, marketplaceResult);
      
      // Add delay between marketplaces
      if (marketplaceIds.indexOf(marketplaceId) < marketplaceIds.length - 1) {
        const delayMs = 10000; // 10 seconds between marketplaces
        console.log(`[ResilientClient] Waiting ${delayMs}ms before next marketplace`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

  getQuotaStatus(): any {
    return {
      quotas: Array.from(this.quotaManager.getQuotaStatus().entries()),
      rateLimits: this.rateLimiter.getStatus()
    };
  }
}