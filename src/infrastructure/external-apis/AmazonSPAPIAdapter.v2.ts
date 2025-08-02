import { IExternalPricingService, PricingData, FeesEstimate } from '@/domain/interfaces/IExternalPricingService';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { IDistributedRateLimiter } from '@/infrastructure/rate-limiting/IDistributedRateLimiter';

/**
 * Enhanced Amazon SP-API adapter with distributed rate limiting
 */
export class AmazonSPAPIAdapterV2 implements IExternalPricingService {
  private competitivePricingClient: SPAPICompetitivePricingClient;
  private feesClient: SPAPIProductFeesClient;

  constructor(private rateLimiter: IDistributedRateLimiter) {
    // Get credentials from environment variables
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const spApiConfig = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    this.competitivePricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
    this.feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);
  }

  async getCompetitivePricing(
    asins: string[],
    marketplaceId: string
  ): Promise<Map<string, PricingData>> {
    const pricingMap = new Map<string, PricingData>();

    try {
      // Wait for rate limit tokens
      await this.rateLimiter.waitForTokens('getCompetitivePricing', asins.length);
      
      const pricingData = await this.competitivePricingClient.getCompetitivePricing(asins, marketplaceId);

      for (const item of pricingData) {
        if (!item.asin) continue;

        let price = 0;
        let numberOfOffers = 0;
        let salesRankings: Array<{ category: string; rank: number }> = [];

        // Extract competitive pricing data
        const competitivePricing = item.competitivePricing;
        
        if (competitivePricing?.competitivePrices) {
          const competitivePrices = competitivePricing.competitivePrices;
          const priceData = competitivePrices.find(
            (cp: any) => cp.competitivePriceId === '1'
          ) || competitivePrices[0];
          
          if (priceData?.price?.amount) {
            price = priceData.price.amount;
          }
        }

        // Extract number of offers
        if (competitivePricing?.numberOfOfferListings) {
          const offerListings = competitivePricing.numberOfOfferListings;
          const newCondition = offerListings.find(
            (l: any) => l.condition === 'New'
          );
          numberOfOffers = newCondition?.count || 0;
        }

        // Extract sales rankings
        if (item.salesRankings?.length) {
          salesRankings = item.salesRankings.map((sr: any) => ({
            category: sr.productCategoryId,
            rank: sr.rank
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
    } catch (error) {
      console.error('Error getting competitive pricing:', error);
      throw error;
    }

    return pricingMap;
  }

  async getFeesEstimate(
    asin: string,
    price: number,
    marketplaceId: string
  ): Promise<FeesEstimate> {
    try {
      // Wait for rate limit tokens
      await this.rateLimiter.waitForTokens('getMyFeesEstimate', 1);
      
      const feesData = await this.feesClient.getMyFeesEstimateForASIN(
        asin,
        {
          listingPrice: {
            currencyCode: this.getCurrencyForMarketplace(marketplaceId),
            amount: price
          }
        },
        marketplaceId
      );

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
    } catch (error) {
      console.error('Error getting fees estimate:', error);
      throw error;
    }
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