export interface IExternalPricingService {
  getCompetitivePricing(
    asins: string[],
    marketplaceId: string
  ): Promise<Map<string, PricingData>>;

  getFeesEstimate(
    asin: string,
    price: number,
    marketplaceId: string
  ): Promise<FeesEstimate>;
}

export interface PricingData {
  asin: string;
  price: number;
  currency: string;
  numberOfOffers: number;
  salesRankings?: Array<{
    category: string;
    rank: number;
  }>;
}

export interface FeesEstimate {
  referralFee: number;
  fbaFee: number;
  totalFees: number;
}