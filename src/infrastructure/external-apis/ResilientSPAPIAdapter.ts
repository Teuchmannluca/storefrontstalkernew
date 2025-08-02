import { IExternalPricingService, PricingData, FeesEstimate } from '@/domain/interfaces/IExternalPricingService';
import { IDistributedRateLimiter } from '@/infrastructure/rate-limiting/IDistributedRateLimiter';
import { CircuitBreaker, CircuitBreakerFactory } from '@/infrastructure/resilience/CircuitBreaker';
import { ISPAPIClientFactory } from '@/infrastructure/factories/ISPAPIClientFactory';
import { ILogger, SpanStatusCode } from '@/infrastructure/logging/ILogger';
import { LoggerFactory } from '@/infrastructure/logging/Logger';
import { monitoring } from '@/infrastructure/monitoring/Monitoring';

/**
 * Resilient SP-API adapter with circuit breaker protection
 */
export class ResilientSPAPIAdapter implements IExternalPricingService {
  private competitivePricingBreaker: CircuitBreaker;
  private feesBreaker: CircuitBreaker;
  private logger: ILogger;

  constructor(
    private clientFactory: ISPAPIClientFactory,
    private rateLimiter: IDistributedRateLimiter
  ) {
    this.logger = LoggerFactory.getLogger('ResilientSPAPIAdapter');

    // Create circuit breakers for each API
    this.competitivePricingBreaker = CircuitBreakerFactory.create({
      name: 'sp-api-competitive-pricing',
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      halfOpenMaxAttempts: 3,
      monitoringPeriod: 300000, // 5 minutes
      volumeThreshold: 10
    });

    this.feesBreaker = CircuitBreakerFactory.create({
      name: 'sp-api-fees',
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      halfOpenMaxAttempts: 2,
      monitoringPeriod: 120000, // 2 minutes
      volumeThreshold: 5
    });
  }

  async getCompetitivePricing(
    asins: string[],
    marketplaceId: string
  ): Promise<Map<string, PricingData>> {
    const span = monitoring.startSpan('getCompetitivePricing', {
      asinCount: asins.length,
      marketplaceId
    });

    try {
      // Execute with circuit breaker protection
      const result = await this.competitivePricingBreaker.execute(async () => {
        // Wait for rate limit tokens
        await this.rateLimiter.waitForTokens('getCompetitivePricing', asins.length);
        
        // Get client and make request
        const client = this.clientFactory.createCompetitivePricingClient();
        const pricingData = await client.getCompetitivePricing(asins, marketplaceId);
        
        return this.processPricingData(pricingData, marketplaceId);
      });

      span.setStatus(SpanStatusCode.OK);
      monitoring.incrementCounter('sp_api.competitive_pricing.success', {
        marketplace: marketplaceId
      });

      return result;
    } catch (error) {
      span.setStatus(SpanStatusCode.ERROR, error instanceof Error ? error.message : 'Unknown error');
      
      monitoring.incrementCounter('sp_api.competitive_pricing.error', {
        marketplace: marketplaceId,
        error: error instanceof Error ? error.name : 'unknown'
      });

      this.logger.error('Failed to get competitive pricing', error as Error, {
        asins: asins.slice(0, 5), // Log first 5 ASINs
        marketplaceId,
        circuitState: this.competitivePricingBreaker.getState()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  async getFeesEstimate(
    asin: string,
    price: number,
    marketplaceId: string
  ): Promise<FeesEstimate> {
    const span = monitoring.startSpan('getFeesEstimate', {
      asin,
      price,
      marketplaceId
    });

    try {
      // Execute with circuit breaker protection
      const result = await this.feesBreaker.execute(async () => {
        // Wait for rate limit tokens
        await this.rateLimiter.waitForTokens('getMyFeesEstimate', 1);
        
        // Get client and make request
        const client = this.clientFactory.createFeesClient();
        const currency = this.getCurrencyForMarketplace(marketplaceId);
        const feesData = await client.getMyFeesEstimate(
          asin,
          price,
          currency,
          marketplaceId
        );
        
        return this.processFeesData(feesData);
      });

      span.setStatus(SpanStatusCode.OK);
      monitoring.incrementCounter('sp_api.fees.success', {
        marketplace: marketplaceId
      });

      return result;
    } catch (error) {
      span.setStatus(SpanStatusCode.ERROR, error instanceof Error ? error.message : 'Unknown error');
      
      monitoring.incrementCounter('sp_api.fees.error', {
        marketplace: marketplaceId,
        error: error instanceof Error ? error.name : 'unknown'
      });

      this.logger.error('Failed to get fees estimate', error as Error, {
        asin,
        price,
        marketplaceId,
        circuitState: this.feesBreaker.getState()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  private processPricingData(
    pricingData: any[],
    marketplaceId: string
  ): Map<string, PricingData> {
    const pricingMap = new Map<string, PricingData>();

    for (const item of pricingData) {
      if (!item.asin) continue;

      let price = 0;
      let numberOfOffers = 0;
      let salesRankings: Array<{ category: string; rank: number }> = [];

      // Handle different response formats from SP-API
      const competitivePricing = item.competitivePricing || item.CompetitivePricing;
      
      if (competitivePricing?.competitivePrices || competitivePricing?.CompetitivePrices) {
        const competitivePrices = competitivePricing.competitivePrices || competitivePricing.CompetitivePrices;
        const priceData = competitivePrices.find(
          (cp: any) => cp.competitivePriceId === '1' || cp.CompetitivePriceId === '1'
        ) || competitivePrices[0];
        
        if (priceData?.Price?.ListingPrice?.Amount) {
          price = parseFloat(priceData.Price.ListingPrice.Amount);
        } else if (priceData?.price?.amount) {
          price = priceData.price.amount;
        } else if (priceData?.Price?.LandedPrice?.Amount) {
          price = parseFloat(priceData.Price.LandedPrice.Amount);
        }
      }

      // Extract number of offers
      if (competitivePricing?.numberOfOfferListings || competitivePricing?.NumberOfOfferListings) {
        const offerListings = competitivePricing.numberOfOfferListings || competitivePricing.NumberOfOfferListings;
        const newCondition = offerListings.find(
          (l: any) => l.condition === 'New' || l.Condition === 'New'
        );
        numberOfOffers = newCondition?.count || newCondition?.Count || 0;
      }

      // Extract sales rankings
      if (item.salesRankings?.length) {
        salesRankings = item.salesRankings.map((sr: any) => ({
          category: sr.productCategoryId || sr.ProductCategoryId,
          rank: sr.rank || sr.Rank
        }));
      }

      pricingMap.set(item.asin, {
        asin: item.asin,
        price,
        currency: this.getCurrencyForMarketplace(marketplaceId),
        numberOfOffers,
        salesRankings
      });
    }

    return pricingMap;
  }

  private processFeesData(feesData: any): FeesEstimate {
    let referralFee = 0;
    let fbaFee = 0;

    if (feesData?.feesEstimate?.feeDetailList) {
      for (const fee of feesData.feesEstimate.feeDetailList) {
        const amount = fee.feeAmount?.amount || 0;
        if (fee.feeType === 'ReferralFee') {
          referralFee = amount;
        } else if (fee.feeType?.includes('FBA') || fee.feeType?.includes('Fulfillment')) {
          fbaFee += amount;
        }
      }
    }

    const totalFees = referralFee + fbaFee;

    return {
      referralFee,
      fbaFee,
      totalFees
    };
  }

  private getCurrencyForMarketplace(marketplaceId: string): string {
    const marketplaceCurrencies: Record<string, string> = {
      'A1F83G8C2ARO7P': 'GBP', // UK
      'A1PA6795UKMFR9': 'EUR', // DE
      'A13V1IB3VIYZZH': 'EUR', // FR
      'APJ6JRA9NG5V4': 'EUR',  // IT
      'A1RKKUPIHCS9HS': 'EUR', // ES
    };
    
    return marketplaceCurrencies[marketplaceId] || 'EUR';
  }
}