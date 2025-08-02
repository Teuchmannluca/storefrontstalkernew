export interface ArbitrageOpportunity {
  asin: string;
  productTitle: string;
  ukPrice: number;
  ukCompetitors: number;
  ukSalesRank: number;
  salesPerMonth?: number;
  sourceMarketplace: string;
  sourcePrice: number;
  sourcePriceGBP: number;
  profitGBP: number;
  roi: number;
  referralFee: number;
  fbaFee: number;
  digitalServicesFee: number;
  totalFees: number;
  netProfit: number;
  confidence: 'high' | 'medium' | 'low';
  lastAnalyzedAt: Date;
}

export interface ArbitrageScan {
  id: string;
  userId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  storefrontId?: string;
  asins?: string[];
  productsScanned: number;
  opportunitiesFound: number;
  metadata?: Record<string, any>;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}