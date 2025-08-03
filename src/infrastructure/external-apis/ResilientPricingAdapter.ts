import { injectable, inject } from 'tsyringe';
import type { IExternalPricingService, PricingData, FeesEstimate } from '@/domain/interfaces/IExternalPricingService';
import { ResilientSPAPIClient } from '@/infrastructure/sp-api/ResilientSPAPIClient';
import { TOKENS } from '@/infrastructure/container';

@injectable()
export class ResilientPricingAdapter implements IExternalPricingService {
  constructor(
    @inject(TOKENS.ResilientSPAPIClient) private spApiClient: ResilientSPAPIClient
  ) {}

  async getCompetitivePricing(
    asins: string[],
    marketplaceId: string
  ): Promise<Map<string, PricingData>> {
    const pricingMap = new Map<string, PricingData>();
    
    try {
      const result = await this.spApiClient.getCompetitivePricingBatch(asins, marketplaceId);
      
      // Process successful results
      for (const product of result.successful) {
        if (product.asin && product.price > 0) {
          pricingMap.set(product.asin, {
            asin: product.asin,
            price: product.price,
            currency: product.currency || 'EUR',
            numberOfOffers: product.numberOfOffers || 0,
            salesRankings: product.salesRankings || []
          });
        }
      }
      
      // Log failed ASINs
      if (result.failed.length > 0) {
        console.warn(`[ResilientPricingAdapter] Failed to get pricing for ${result.failed.length} ASINs:`, 
          result.failed.map(f => f.identifier)
        );
      }
      
    } catch (error) {
      console.error('[ResilientPricingAdapter] Error getting competitive pricing:', error);
      // Return empty map rather than throwing
    }
    
    return pricingMap;
  }

  async getFeesEstimate(
    asin: string,
    price: number,
    marketplaceId: string
  ): Promise<FeesEstimate> {
    try {
      return await this.spApiClient.getFeesEstimate(asin, price, marketplaceId);
    } catch (error) {
      console.error('[ResilientPricingAdapter] Error getting fees estimate:', error);
      
      // Return estimated fees as fallback
      const referralFee = price * 0.15;  // 15% estimated
      const fbaFee = 3;                   // €3 estimated
      
      return {
        referralFee,
        fbaFee,
        totalFees: referralFee + fbaFee
      };
    }
  }

  async getCompetitivePricingBatch(
    requests: Array<{ asin: string; marketplaceId: string }>
  ): Promise<Map<string, PricingData>> {
    const pricingMap = new Map<string, PricingData>();
    
    // Group by marketplace
    const marketplaceGroups = new Map<string, string[]>();
    for (const req of requests) {
      if (!marketplaceGroups.has(req.marketplaceId)) {
        marketplaceGroups.set(req.marketplaceId, []);
      }
      marketplaceGroups.get(req.marketplaceId)!.push(req.asin);
    }
    
    // Process each marketplace
    for (const [marketplaceId, asins] of marketplaceGroups) {
      const marketplacePricing = await this.getCompetitivePricing(asins, marketplaceId);
      
      for (const [asin, pricing] of marketplacePricing) {
        pricingMap.set(`${marketplaceId}:${asin}`, pricing);
      }
    }
    
    return pricingMap;
  }

  getQuotaStatus(): any {
    return this.spApiClient.getQuotaStatus();
  }
}