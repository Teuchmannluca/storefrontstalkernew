import { injectable, inject } from 'tsyringe';
import type { 
  IArbitrageService, 
  ArbitrageScanResult, 
  ArbitrageProgressMessage,
  ProductPricingData 
} from '@/domain/interfaces/IArbitrageService';
import type { IProductRepository } from '@/domain/interfaces/IProductRepository';
import type { IExternalPricingService } from '@/domain/interfaces/IExternalPricingService';
import type { IArbitrageScanRepository } from '@/domain/interfaces/IArbitrageScanRepository';
import type { Product } from '@/domain/models/Product';
import type { ArbitrageOpportunity } from '@/domain/models/ArbitrageOpportunity';
import { MARKETPLACES } from '@/lib/amazon-marketplaces';
import { convertToGBP } from '@/lib/exchange-rates';
import { estimateMonthlySales } from '@/lib/sales-estimator';
import { TOKENS } from '@/infrastructure/container';

@injectable()
export class ArbitrageAnalysisServiceV3 implements IArbitrageService {
  private readonly BATCH_SIZE = 20;
  private readonly MIN_PROFIT_THRESHOLD = 0;
  private readonly DIGITAL_SERVICES_TAX_RATE = 0.02;

  constructor(
    @inject(TOKENS.ProductRepository) private productRepository: IProductRepository,
    @inject(TOKENS.ExternalPricingService) private pricingService: IExternalPricingService,
    @inject(TOKENS.ArbitrageScanRepository) private scanRepository: IArbitrageScanRepository
  ) {}

  async analyzeStorefront(
    storefrontId: string,
    userId: string,
    onProgress?: (message: ArbitrageProgressMessage) => void
  ): Promise<ArbitrageScanResult> {
    const results: ArbitrageScanResult[] = [];
    
    for await (const message of this.analyzeStorefrontStream(storefrontId, userId)) {
      onProgress?.(message);
      if (message.type === 'complete') {
        results.push(message.data as ArbitrageScanResult);
      }
    }
    
    return results[0];
  }

  async *analyzeStorefrontStream(
    storefrontId: string,
    userId: string
  ): AsyncGenerator<ArbitrageProgressMessage> {
    const scan = await this.scanRepository.create({
      userId,
      storefrontId,
      status: 'in_progress',
      productsScanned: 0,
      opportunitiesFound: 0,
      startedAt: new Date()
    });

    try {
      yield { type: 'progress', data: { step: 'Loading products...', progress: 5 } };
      
      const products = await this.productRepository.findByStorefront(storefrontId);
      
      if (products.length === 0) {
        throw new Error('No products found for this storefront');
      }

      const opportunities: ArbitrageOpportunity[] = [];
      let productsAnalyzed = 0;

      for await (const message of this.analyzeProductsStream(products, scan.id, userId)) {
        if (message.type === 'opportunity') {
          opportunities.push(message.data as ArbitrageOpportunity);
        } else if (message.type === 'progress' && message.data.processedCount) {
          productsAnalyzed = message.data.processedCount;
        }
        yield message;
      }
      
      await this.scanRepository.update(scan.id, {
        status: 'completed',
        productsScanned: productsAnalyzed,
        opportunitiesFound: opportunities.length,
        completedAt: new Date()
      });

      const result: ArbitrageScanResult = {
        scanId: scan.id,
        productsAnalyzed,
        opportunitiesFound: opportunities.length,
        opportunities,
        completedAt: new Date()
      };

      yield { type: 'complete', data: result };
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
    const results: ArbitrageScanResult[] = [];
    
    for await (const message of this.analyzeASINsStream(asins, userId)) {
      onProgress?.(message);
      if (message.type === 'complete') {
        results.push(message.data as ArbitrageScanResult);
      }
    }
    
    return results[0];
  }

  async *analyzeASINsStream(
    asins: string[],
    userId: string
  ): AsyncGenerator<ArbitrageProgressMessage> {
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
      const opportunities: ArbitrageOpportunity[] = [];
      let productsAnalyzed = 0;

      for await (const message of this.analyzeProductsStream(products, scan.id, userId)) {
        if (message.type === 'opportunity') {
          opportunities.push(message.data as ArbitrageOpportunity);
        } else if (message.type === 'progress' && message.data.processedCount) {
          productsAnalyzed = message.data.processedCount;
        }
        yield message;
      }
      
      await this.scanRepository.update(scan.id, {
        status: 'completed',
        productsScanned: productsAnalyzed,
        opportunitiesFound: opportunities.length,
        completedAt: new Date()
      });

      const result: ArbitrageScanResult = {
        scanId: scan.id,
        productsAnalyzed,
        opportunitiesFound: opportunities.length,
        opportunities,
        completedAt: new Date()
      };

      yield { type: 'complete', data: result };
    } catch (error) {
      await this.scanRepository.update(scan.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date()
      });
      throw error;
    }
  }

  private async *analyzeProductsStream(
    products: Product[],
    scanId: string,
    userId: string
  ): AsyncGenerator<ArbitrageProgressMessage> {
    const estimatedTimePerProduct = 3; // seconds
    const totalEstimatedSeconds = products.length * estimatedTimePerProduct;

    yield {
      type: 'progress',
      data: {
        step: `Analyzing ${products.length} products...`,
        progress: 10,
        totalProducts: products.length,
        estimatedTimeMinutes: Math.ceil(totalEstimatedSeconds / 60)
      }
    };

    let processedCount = 0;

    // Process in batches
    for (let i = 0; i < products.length; i += this.BATCH_SIZE) {
      const batch = products.slice(i, i + this.BATCH_SIZE);
      const batchProgress = 20 + (i / products.length) * 60;

      yield {
        type: 'progress',
        data: {
          step: `Processing batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(products.length / this.BATCH_SIZE)}...`,
          progress: batchProgress,
          processedCount: i,
          totalProducts: products.length
        }
      };

      const batchOpportunities = await this.analyzeBatch(batch);
      
      for (const opportunity of batchOpportunities) {
        processedCount++;

        // Save opportunity to database
        await this.scanRepository.addOpportunity(scanId, opportunity);

        yield {
          type: 'opportunity',
          data: opportunity
        };
      }
    }

    yield {
      type: 'progress',
      data: {
        step: 'Analysis complete',
        progress: 100,
        processedCount,
        totalProducts: products.length
      }
    };
  }

  private async analyzeBatch(products: Product[]): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const asins = products.map(p => p.asin);

    // Get UK pricing for all products in batch
    const ukPricing = await this.pricingService.getCompetitivePricing(asins, MARKETPLACES.UK.id);

    // Get EU pricing for all marketplaces
    const euPricingPromises = Object.entries(MARKETPLACES)
      .filter(([key]) => key !== 'UK')
      .map(async ([key, marketplace]) => ({
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