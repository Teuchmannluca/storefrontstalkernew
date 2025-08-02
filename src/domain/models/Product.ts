export interface Product {
  asin: string;
  title: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  currentSalesRank?: number;
  salesPerMonth?: number;
  ukPrice?: number;
  availability?: string;
  lastSyncedAt?: Date;
  storefronts?: string[];
  competitorCount?: number;
}

export interface ProductPricing {
  marketplace: string;
  price: number;
  currency: string;
  numberOfOffers: number;
  salesRankings?: Array<{
    category: string;
    rank: number;
  }>;
}

export interface ProductFees {
  referralFee: number;
  fbaFee: number;
  totalFees: number;
}