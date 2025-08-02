import { Product } from '../models/Product';
import { ArbitrageOpportunity } from '../models/ArbitrageOpportunity';
import { MARKETPLACES } from '@/lib/amazon-marketplaces';
import { convertToGBP } from '@/lib/exchange-rates';
import { estimateMonthlySales } from '@/lib/sales-estimator';

export class StorefrontAggregate {
  private readonly DIGITAL_SERVICES_TAX_RATE = 0.02;
  private readonly MIN_PROFIT_THRESHOLD = 0;

  constructor(
    public readonly id: string,
    public readonly sellerId: string,
    public readonly sellerName: string,
    public readonly marketplaceId: string,
    private products: Product[] = []
  ) {}

  addProduct(product: Product): void {
    const existingIndex = this.products.findIndex(p => p.asin === product.asin);
    if (existingIndex >= 0) {
      this.products[existingIndex] = product;
    } else {
      this.products.push(product);
    }
  }

  removeProduct(asin: string): void {
    this.products = this.products.filter(p => p.asin !== asin);
  }

  getProducts(): ReadonlyArray<Product> {
    return this.products;
  }

  getProductCount(): number {
    return this.products.length;
  }

  calculateArbitrageOpportunities(
    marketplacePrices: Map<string, Map<string, number>>,
    feeEstimates: Map<string, { referralFee: number; fbaFee: number; totalFees: number }>
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const product of this.products) {
      const productOpportunities = this.calculateProductArbitrage(
        product,
        marketplacePrices.get(product.asin) || new Map(),
        feeEstimates.get(product.asin)
      );
      opportunities.push(...productOpportunities);
    }

    return opportunities;
  }

  private calculateProductArbitrage(
    product: Product,
    marketplacePrices: Map<string, number>,
    ukFees?: { referralFee: number; fbaFee: number; totalFees: number }
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const ukPrice = marketplacePrices.get('UK');

    if (!ukPrice || !ukFees) {
      return opportunities;
    }

    const digitalServicesFee = ukFees.totalFees * this.DIGITAL_SERVICES_TAX_RATE;
    const totalUKFees = ukFees.totalFees + digitalServicesFee;
    const salesPerMonth = product.salesPerMonth || estimateMonthlySales(
      product.currentSalesRank || 0,
      'Home & Kitchen'
    );

    for (const [marketplace, price] of marketplacePrices) {
      if (marketplace === 'UK' || price <= 0) continue;

      const sourcePriceGBP = convertToGBP(price, 'EUR');
      const profitGBP = ukPrice - sourcePriceGBP - totalUKFees;
      const roi = (profitGBP / sourcePriceGBP) * 100;

      if (profitGBP > this.MIN_PROFIT_THRESHOLD) {
        opportunities.push({
          asin: product.asin,
          productTitle: product.title,
          ukPrice,
          ukCompetitors: product.competitorCount || 0,
          ukSalesRank: product.currentSalesRank || 0,
          salesPerMonth,
          sourceMarketplace: marketplace,
          sourcePrice: price,
          sourcePriceGBP,
          profitGBP,
          roi,
          referralFee: ukFees.referralFee,
          fbaFee: ukFees.fbaFee,
          digitalServicesFee,
          totalFees: totalUKFees,
          netProfit: profitGBP,
          confidence: this.calculateConfidence(roi, salesPerMonth),
          lastAnalyzedAt: new Date()
        });
      }
    }

    return opportunities;
  }

  private calculateConfidence(
    roi: number,
    salesPerMonth: number
  ): 'high' | 'medium' | 'low' {
    if (roi > 30 && salesPerMonth > 50) return 'high';
    if (roi > 15 && salesPerMonth > 20) return 'medium';
    return 'low';
  }

  hasProducts(): boolean {
    return this.products.length > 0;
  }

  getLastSyncDate(): Date | null {
    if (this.products.length === 0) return null;
    
    const dates = this.products
      .map(p => p.lastSyncedAt)
      .filter(d => d !== null) as Date[];
    
    if (dates.length === 0) return null;
    
    return new Date(Math.max(...dates.map(d => d.getTime())));
  }

  needsSync(hoursThreshold: number = 24): boolean {
    const lastSync = this.getLastSyncDate();
    if (!lastSync) return true;
    
    const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
    return hoursSinceSync > hoursThreshold;
  }
}