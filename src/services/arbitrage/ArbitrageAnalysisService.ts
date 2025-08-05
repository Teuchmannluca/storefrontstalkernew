import { 
  IArbitrageService, 
  ArbitrageScanResult, 
  ArbitrageProgressMessage,
  ProductPricingData 
} from '@/domain/interfaces/IArbitrageService';
import { IProductRepository } from '@/domain/interfaces/IProductRepository';
import { IExternalPricingService } from '@/domain/interfaces/IExternalPricingService';
import { Product } from '@/domain/models/Product';
import { ArbitrageOpportunity, ArbitrageScan } from '@/domain/models/ArbitrageOpportunity';
import { MARKETPLACES } from '@/lib/amazon-marketplaces';
import { convertToGBP } from '@/lib/exchange-rates';
import { estimateMonthlySales } from '@/lib/sales-estimator';

export class ArbitrageAnalysisService implements IArbitrageService {
  private readonly BATCH_SIZE = 20;
  private readonly MIN_PROFIT_THRESHOLD = 0;
  private readonly DIGITAL_SERVICES_TAX_RATE = 0.02;

  constructor(
    private productRepository: IProductRepository,
    private pricingService: IExternalPricingService,
    private scanRepository: IArbitrageScanRepository
  ) {}

  async analyzeStorefront(
    storefrontId: string,
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult> {
    const scan = await this.scanRepository.create({
      userId,
      storefrontId,
      status: 'in_progress',
      productsScanned: 0,
      opportunitiesFound: 0,
      startedAt: new Date()
    });

    try {
      onProgress?.({ type: 'progress', data: { step: 'Loading products...', progress: 5 } });
      
      const products = await this.productRepository.findByStorefront(storefrontId);
      
      if (products.length === 0) {
        throw new Error('No products found for this storefront');
      }

      const result = await this.analyzeProducts(products, scan.id, userId, onProgress);
      
      await this.scanRepository.update(scan.id, {
        status: 'completed',
        productsScanned: result.productsAnalyzed,
        opportunitiesFound: result.opportunitiesFound,
        completedAt: new Date()
      });

      return result;
    } catch (error) {
      await this.scanRepository.update(scan.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      throw error;
    }
  }

  async analyzeASINs(
    asins: string[],
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult> {
    const scan = await this.scanRepository.create({
      userId,
      asins,
      status: 'in_progress',
      productsScanned: 0,
      opportunitiesFound: 0,
      startedAt: new Date()
    });

    try {
      const products = await this.productRepository.findByASINs(asins);
      const result = await this.analyzeProducts(products, scan.id, userId, onProgress);
      
      await this.scanRepository.update(scan.id, {
        status: 'completed',
        productsScanned: result.productsAnalyzed,
        opportunitiesFound: result.opportunitiesFound,
        completedAt: new Date()
      });

      return result;
    } catch (error) {
      await this.scanRepository.update(scan.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      throw error;
    }
  }

  private async analyzeProducts(
    products: Product[],
    scanId: string,
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult> {
    const opportunities: ArbitrageOpportunity[] = [];
    let productsAnalyzed = 0;

    const estimatedTimePerProduct = 3; // seconds
    const totalEstimatedSeconds = products.length * estimatedTimePerProduct;

    onProgress?.({
      type: 'progress',
      data: {
        step: `Analyzing ${products.length} products...`,
        progress: 10,
        totalProducts: products.length,
        estimatedTimeMinutes: Math.ceil(totalEstimatedSeconds / 60)
      }
    });

    // Process in batches
    for (let i = 0; i < products.length; i += this.BATCH_SIZE) {
      const batch = products.slice(i, i + this.BATCH_SIZE);
      const batchProgress = 20 + (i / products.length) * 60;

      onProgress?.({
        type: 'progress',
        data: {
          step: `Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(products.length / this.BATCH_SIZE)}...`,
          progress: batchProgress,
          processedCount: i,
          totalProducts: products.length
        }
      });

      const batchOpportunities = await this.analyzeBatch(batch);
      
      for (const opportunity of batchOpportunities) {
        opportunities.push(opportunity);
        productsAnalyzed++;

        // Save opportunity to database
        await this.scanRepository.addOpportunity(scanId, opportunity);

        onProgress?.({
          type: 'opportunity',
          data: opportunity
        });
      }
    }

    onProgress?.({
      type: 'complete',
      data: {
        scanId,
        productsAnalyzed,
        opportunitiesFound: opportunities.length
      }
    });

    return {
      scanId,
      productsAnalyzed,
      opportunitiesFound: opportunities.length,
      opportunities,
      completedAt: new Date()
    };
  }

  private async analyzeBatch(products: Product[]): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const asins = products.map((p: any) => p.asin);

    // Get UK pricing for all products in batch
    const ukPricing = await this.pricingService.getCompetitivePricing(asins, MARKETPLACES.UK.id);

    // Get EU pricing for all marketplaces
    const euPricingPromises = Object.entries(MARKETPLACES)
      .filter(([key]: any) => key !== 'UK')
      .map(async ([key, marketplace]: any) => ({
        marketplace: key,
        pricing: await this.pricingService.getCompetitivePricing(asins, marketplace.id)
      }));

    const euPricingResults = await Promise.all(euPricingPromises);

    // Analyze each product
    for (const product of products) {
      const ukData = ukPricing.get(product.asin);
      if (!ukData || !ukData.price || ukData.price <= 0) {
        continue;
      }

      // Collect pricing from all EU marketplaces
      const marketplacePrices = new Map<string, ProductPricingData>();
      marketplacePrices.set('UK', ukData);

      for (const { marketplace, pricing } of euPricingResults) {
        const euData = pricing.get(product.asin);
        if (euData && euData.price > 0) {
          marketplacePrices.set(marketplace, euData);
        }
      }

      // Calculate arbitrage opportunities
      const productOpportunities = await this.calculateArbitrageOpportunity(
        product,
        marketplacePrices
      );

      opportunities.push(...productOpportunities);
    }

    return opportunities;
  }

  async calculateArbitrageOpportunity(
    product: Product,
    marketplacePrices: Map<string, ProductPricingData>
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const ukData = marketplacePrices.get('UK');
    
    if (!ukData) {
      return opportunities;
    }

    const ukPrice = ukData.price;
    const ukSalesRank = product.currentSalesRank || ukData.salesRankings?.[0]?.rank || 0;
    const salesPerMonth = product.salesPerMonth || estimateMonthlySales(ukSalesRank, 'Home & Kitchen');

    // Get UK fees
    const ukFees = await this.pricingService.getFeesEstimate(
      product.asin,
      ukPrice,
      MARKETPLACES.UK.id
    );

    const digitalServicesFee = ukFees.totalFees * this.DIGITAL_SERVICES_TAX_RATE;
    const totalUKFees = ukFees.totalFees + digitalServicesFee;

    // Check each EU marketplace
    for (const [marketplace, data] of marketplacePrices) {
      if (marketplace === 'UK') continue;

      const sourcePrice = data.price;
      const sourcePriceGBP = convertToGBP(sourcePrice, 'EUR');
      const profitGBP = ukPrice - sourcePriceGBP - totalUKFees;
      const roi = (profitGBP / sourcePriceGBP) * 100;

      if (profitGBP > this.MIN_PROFIT_THRESHOLD) {
        opportunities.push({
          asin: product.asin,
          productTitle: product.title,
          ukPrice,
          ukCompetitors: ukData.numberOfOffers,
          ukSalesRank,
          salesPerMonth,
          sourceMarketplace: marketplace,
          sourcePrice,
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
}

// Repository interface for scans
export interface IArbitrageScanRepository {
  create(scan: Partial<ArbitrageScan>): Promise<ArbitrageScan>;
  update(id: string, data: Partial<ArbitrageScan>): Promise<void>;
  addOpportunity(scanId: string, opportunity: ArbitrageOpportunity): Promise<void>;
}