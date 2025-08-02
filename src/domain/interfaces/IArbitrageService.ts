import { ArbitrageOpportunity, ArbitrageScan } from '../models/ArbitrageOpportunity';
import { Product } from '../models/Product';

export interface IArbitrageService {
  analyzeStorefront(
    storefrontId: string,
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult>;

  analyzeASINs(
    asins: string[],
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult>;

  calculateArbitrageOpportunity(
    product: Product,
    marketplacePrices: Map<string, ProductPricingData>
  ): Promise<ArbitrageOpportunity[]>;
}

export interface ArbitrageScanResult {
  scanId: string;
  productsAnalyzed: number;
  opportunitiesFound: number;
  opportunities: ArbitrageOpportunity[];
  completedAt: Date;
}

export interface ArbitrageProgressMessage {
  type: 'progress' | 'opportunity' | 'error' | 'complete';
  data: any;
}

export interface ProductPricingData {
  price: number;
  currency: string;
  numberOfOffers: number;
  salesRankings?: Array<{ category: string; rank: number }>;
}