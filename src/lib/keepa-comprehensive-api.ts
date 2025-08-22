import axios from 'axios';

// Comprehensive Keepa data structure for AI analysis
export interface KeepaComprehensiveData {
  // Basic Product Info
  asin: string;
  title: string;
  brand: string;
  mainImage: string;
  category: string;
  reviewCount: number;
  rating: number;
  
  // Sales Metrics (All Time)
  salesPerMonth: number | null;
  salesRank: number | null;
  salesRankHistory: Array<{date: Date, rank: number}>;
  salesDrops30d: number;
  salesDrops90d: number;
  salesDrops180d: number;
  salesDropsAllTime: number;
  
  // Price History (All Available Periods)
  currentBuyPrice: number | null;
  buyPrice30d: number | null;
  buyPrice90d: number | null;
  buyPrice180d: number | null;
  buyPrice365d: number | null;
  avgPriceAllTime: number | null;
  lowestPriceEver: number | null;
  highestPriceEver: number | null;
  
  // Seller Metrics
  currentSellPrice: number | null;
  sellPrice30d: number | null;
  sellPrice180d: number | null;
  buyBoxPrice: number | null;
  buyBoxWinRate: number | null;
  
  // Competition Data
  totalOfferCount: number;
  fbaOfferCount: number;
  fbmOfferCount: number;
  amazonInStock: boolean;
  competitorHistory: Array<{date: Date, count: number}>;
  
  // Market Intelligence
  outOfStockPercentage30d: number | null;
  outOfStockPercentage90d: number | null;
  priceChangeFrequency: number;
  reviewVelocity: number;
  
  // Historical Price Arrays (for trend analysis)
  priceHistory: Array<{date: Date, price: number}>;
  salesRankHistory30d: Array<{date: Date, rank: number}>;
  
  // Data Quality Indicators
  dataCompleteness: number; // 0-100%
  lastUpdated: Date;
  spmDataSource: 'none' | '30day' | '90day' | '180day' | 'all_time';
  spmConfidence: 'none' | 'low' | 'medium' | 'high' | 'very_high';
}

export interface KeepaHistoricalOptions {
  includePriceHistory: boolean;
  includeOfferHistory: boolean;
  includeRankHistory: boolean;
  daysBack: number; // 30, 90, 180, 365, or -1 for all available
  includeReviews: boolean;
}

export class KeepaComprehensiveAPI {
  private apiKey: string;
  private domain: number;
  
  constructor(apiKey: string, domain: number = 2) { // 2 = UK
    this.apiKey = apiKey;
    this.domain = domain;
  }
  
  /**
   * Fetch comprehensive historical data for AI analysis
   */
  async getComprehensiveData(
    asin: string, 
    options: KeepaHistoricalOptions = {
      includePriceHistory: true,
      includeOfferHistory: true,
      includeRankHistory: true,
      daysBack: -1, // All available data
      includeReviews: true
    }
  ): Promise<KeepaComprehensiveData | null> {
    try {
      const url = 'https://api.keepa.com/product';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        asin: asin,
        stats: options.daysBack === -1 ? 365 : options.daysBack, // Maximum stats period
        history: 1, // Include full price history
        offers: 100, // Get extensive offer data
        buybox: 1, // Include buy box data
        update: 0, // Don't force update
        rating: options.includeReviews ? 1 : 0, // Include rating history
      };
      
      const response = await axios.get(url, { params });
      
      if (response.data && response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        return this.parseComprehensiveData(product, options);
      }
      
      return null;
    } catch (error) {
      console.error('Keepa Comprehensive API error:', error);
      throw error;
    }
  }
  
  /**
   * Batch fetch comprehensive data for multiple ASINs
   */
  async getBatchComprehensiveData(
    asins: string[], 
    options: KeepaHistoricalOptions = {
      includePriceHistory: true,
      includeOfferHistory: true,
      includeRankHistory: true,
      daysBack: 180, // 6 months for batch to manage token usage
      includeReviews: false
    }
  ): Promise<KeepaComprehensiveData[]> {
    try {
      const batchSize = 50; // Reduce batch size for comprehensive data
      const results: KeepaComprehensiveData[] = [];
      
      for (let i = 0; i < asins.length; i += batchSize) {
        const batch = asins.slice(i, i + batchSize);
        const url = 'https://api.keepa.com/product';
        const params = {
          key: this.apiKey,
          domain: this.domain,
          asin: batch.join(','),
          stats: options.daysBack === -1 ? 365 : options.daysBack,
          history: options.includePriceHistory ? 1 : 0,
          offers: options.includeOfferHistory ? 100 : 20,
          buybox: 1,
          rating: options.includeReviews ? 1 : 0,
        };
        
        const response = await axios.get(url, { params });
        
        if (response.data && response.data.products) {
          const batchResults = response.data.products
            .map((product: any) => this.parseComprehensiveData(product, options))
            .filter((data: KeepaComprehensiveData | null) => data !== null);
          results.push(...batchResults);
        }
        
        // Rate limiting between batches
        if (i + batchSize < asins.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return results;
    } catch (error) {
      console.error('Keepa Comprehensive API batch error:', error);
      throw error;
    }
  }
  
  private parseComprehensiveData(product: any, options: KeepaHistoricalOptions): KeepaComprehensiveData | null {
    try {
      // Extract basic product information
      const asin = product.asin || '';
      const title = product.title || 'Unknown Product';
      const brand = product.brand || '';
      const mainImage = this.extractMainImage(product.imagesCSV);
      const category = this.extractCategory(product.categoryTree);
      const reviewCount = product.reviewCount || 0;
      const rating = product.avgRating ? product.avgRating / 10 : 0; // Keepa stores rating * 10
      
      // Extract sales data
      const stats = product.stats || {};
      const salesDrops30d = stats.salesRankDrops30 || 0;
      const salesDrops90d = stats.salesRankDrops90 || 0;
      const salesDrops180d = stats.salesRankDrops180 || 0;
      
      // Calculate comprehensive SPM
      const salesData = this.calculateComprehensiveSPM(stats, product.data);
      
      // Extract price data from all periods
      const priceData = this.extractComprehensivePricing(stats, product.data);
      
      // Extract competition data
      const competitionData = this.extractCompetitionData(product.offers, stats);
      
      // Extract historical arrays
      const historicalData = this.extractHistoricalArrays(product.data, options);
      
      // Calculate data quality metrics
      const dataQuality = this.calculateDataQuality(product);
      
      return {
        // Basic Info
        asin,
        title,
        brand,
        mainImage,
        category,
        reviewCount,
        rating,
        
        // Sales Metrics
        salesPerMonth: salesData.estimatedMonthlySales,
        salesRank: this.extractCurrentSalesRank(product.salesRanks),
        salesRankHistory: historicalData.salesRankHistory,
        salesDrops30d,
        salesDrops90d,
        salesDrops180d,
        salesDropsAllTime: salesData.salesDropsAllTime,
        
        // Price History
        currentBuyPrice: priceData.currentPrice,
        buyPrice30d: priceData.price30d,
        buyPrice90d: priceData.price90d,
        buyPrice180d: priceData.price180d,
        buyPrice365d: priceData.price365d,
        avgPriceAllTime: priceData.avgPriceAllTime,
        lowestPriceEver: priceData.lowestPriceEver,
        highestPriceEver: priceData.highestPriceEver,
        
        // Seller Metrics
        currentSellPrice: priceData.currentSellPrice,
        sellPrice30d: priceData.sellPrice30d,
        sellPrice180d: priceData.sellPrice180d,
        buyBoxPrice: priceData.buyBoxPrice,
        buyBoxWinRate: competitionData.buyBoxWinRate,
        
        // Competition
        totalOfferCount: competitionData.totalOffers,
        fbaOfferCount: competitionData.fbaOffers,
        fbmOfferCount: competitionData.fbmOffers,
        amazonInStock: competitionData.amazonInStock,
        competitorHistory: historicalData.competitorHistory,
        
        // Market Intelligence
        outOfStockPercentage30d: stats.outOfStockPercentage30,
        outOfStockPercentage90d: stats.outOfStockPercentage90,
        priceChangeFrequency: this.calculatePriceChangeFrequency(historicalData.priceHistory),
        reviewVelocity: this.calculateReviewVelocity(product.data),
        
        // Historical Data
        priceHistory: historicalData.priceHistory,
        salesRankHistory30d: historicalData.salesRankHistory30d,
        
        // Data Quality
        dataCompleteness: dataQuality.completeness,
        lastUpdated: new Date(),
        spmDataSource: salesData.dataSource,
        spmConfidence: salesData.confidence,
      };
    } catch (error) {
      console.error('Error parsing comprehensive data for ASIN:', product.asin, error);
      return null;
    }
  }
  
  private extractMainImage(imagesCSV: string): string {
    if (!imagesCSV) return '';
    const images = imagesCSV.split(',');
    return images.length > 0 ? `https://images-na.ssl-images-amazon.com/images/I/${images[0]}` : '';
  }
  
  private extractCategory(categoryTree: any[]): string {
    if (!categoryTree || categoryTree.length === 0) return '';
    return categoryTree[0].name || '';
  }
  
  private extractCurrentSalesRank(salesRanks: any): number | null {
    if (!salesRanks) return null;
    const ranks = Object.values(salesRanks);
    return ranks.length > 0 ? ranks[0] as number : null;
  }
  
  private calculateComprehensiveSPM(stats: any, data: any): {
    estimatedMonthlySales: number | null;
    salesDropsAllTime: number;
    dataSource: 'none' | '30day' | '90day' | '180day' | 'all_time';
    confidence: 'none' | 'low' | 'medium' | 'high' | 'very_high';
  } {
    const salesDrops30d = stats.salesRankDrops30 || 0;
    const salesDrops90d = stats.salesRankDrops90 || 0;
    const salesDrops180d = stats.salesRankDrops180 || 0;
    
    // Calculate all-time sales drops from historical data
    let salesDropsAllTime = 0;
    if (data && data[3]) { // Sales rank data type
      salesDropsAllTime = this.countSalesDropsFromHistory(data[3]);
    }
    
    let estimatedMonthlySales: number | null = null;
    let dataSource: 'none' | '30day' | '90day' | '180day' | 'all_time' = 'none';
    let confidence: 'none' | 'low' | 'medium' | 'high' | 'very_high' = 'none';
    
    if (salesDropsAllTime > 0) {
      // Use all-time data if available
      const monthsOfData = this.calculateMonthsOfHistoricalData(data);
      estimatedMonthlySales = Math.round(salesDropsAllTime / Math.max(monthsOfData, 1));
      dataSource = 'all_time';
      confidence = 'very_high';
    } else if (salesDrops180d > 0) {
      estimatedMonthlySales = Math.round(salesDrops180d / 6);
      dataSource = '180day';
      confidence = 'high';
    } else if (salesDrops90d > 0) {
      estimatedMonthlySales = Math.round(salesDrops90d / 3);
      dataSource = '90day';
      confidence = 'high';
    } else if (salesDrops30d > 0) {
      estimatedMonthlySales = salesDrops30d;
      dataSource = '30day';
      confidence = 'medium';
    }
    
    return {
      estimatedMonthlySales,
      salesDropsAllTime,
      dataSource,
      confidence
    };
  }
  
  private extractComprehensivePricing(stats: any, data: any): {
    currentPrice: number | null;
    price30d: number | null;
    price90d: number | null;
    price180d: number | null;
    price365d: number | null;
    avgPriceAllTime: number | null;
    lowestPriceEver: number | null;
    highestPriceEver: number | null;
    currentSellPrice: number | null;
    sellPrice30d: number | null;
    sellPrice180d: number | null;
    buyBoxPrice: number | null;
  } {
    // Extract current and historical prices from stats
    const currentPrice = this.parsePrice(stats.current);
    const price30d = this.parsePrice(stats.avg30);
    const price90d = this.parsePrice(stats.avg90);
    const price180d = this.parsePrice(stats.avg180);
    
    // Calculate all-time metrics from historical data
    const allTimePrices = this.extractAllTimePrices(data);
    
    return {
      currentPrice,
      price30d,
      price90d,
      price180d,
      price365d: allTimePrices.avg365d,
      avgPriceAllTime: allTimePrices.avgAllTime,
      lowestPriceEver: allTimePrices.lowestEver,
      highestPriceEver: allTimePrices.highestEver,
      currentSellPrice: this.parsePrice(stats.currentSell),
      sellPrice30d: this.parsePrice(stats.avgSell30),
      sellPrice180d: this.parsePrice(stats.avgSell180),
      buyBoxPrice: this.parsePrice(stats.buyBoxPrice),
    };
  }
  
  private extractCompetitionData(offers: any[], stats: any): {
    totalOffers: number;
    fbaOffers: number;
    fbmOffers: number;
    amazonInStock: boolean;
    buyBoxWinRate: number | null;
  } {
    let totalOffers = 0;
    let fbaOffers = 0;
    let fbmOffers = 0;
    let amazonInStock = false;
    
    if (offers && Array.isArray(offers)) {
      totalOffers = offers.length;
      
      for (const offer of offers) {
        if (offer.isFBA) {
          fbaOffers++;
        } else {
          fbmOffers++;
        }
        
        if (offer.sellerId === 'Amazon') {
          amazonInStock = true;
        }
      }
    }
    
    // Extract buy box win rate
    let buyBoxWinRate = null;
    if (stats.buyBoxStats) {
      const winRates = Object.values(stats.buyBoxStats).map((s: any) => s.percentageWon || 0);
      if (winRates.length > 0) {
        buyBoxWinRate = Math.max(...winRates);
      }
    }
    
    return {
      totalOffers,
      fbaOffers,
      fbmOffers,
      amazonInStock,
      buyBoxWinRate
    };
  }
  
  private extractHistoricalArrays(data: any, options: KeepaHistoricalOptions): {
    priceHistory: Array<{date: Date, price: number}>;
    salesRankHistory: Array<{date: Date, rank: number}>;
    salesRankHistory30d: Array<{date: Date, rank: number}>;
    competitorHistory: Array<{date: Date, count: number}>;
  } {
    const priceHistory: Array<{date: Date, price: number}> = [];
    const salesRankHistory: Array<{date: Date, rank: number}> = [];
    const salesRankHistory30d: Array<{date: Date, rank: number}> = [];
    const competitorHistory: Array<{date: Date, count: number}> = [];
    
    if (!data || !options.includePriceHistory) {
      return { priceHistory, salesRankHistory, salesRankHistory30d, competitorHistory };
    }
    
    // Parse price history (data type 1 = Amazon price)
    if (data[1] && Array.isArray(data[1])) {
      for (let i = 0; i < data[1].length; i += 2) {
        const timestamp = data[1][i];
        const price = data[1][i + 1];
        
        if (timestamp && price !== -1) {
          const date = this.keepaTimeToDate(timestamp);
          priceHistory.push({ date, price: price / 100 });
        }
      }
    }
    
    // Parse sales rank history (data type 3)
    if (data[3] && Array.isArray(data[3])) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      for (let i = 0; i < data[3].length; i += 2) {
        const timestamp = data[3][i];
        const rank = data[3][i + 1];
        
        if (timestamp && rank !== -1) {
          const date = this.keepaTimeToDate(timestamp);
          salesRankHistory.push({ date, rank });
          
          if (date >= thirtyDaysAgo) {
            salesRankHistory30d.push({ date, rank });
          }
        }
      }
    }
    
    return { priceHistory, salesRankHistory, salesRankHistory30d, competitorHistory };
  }
  
  private calculateDataQuality(product: any): { completeness: number } {
    let score = 0;
    const maxScore = 10;
    
    if (product.title) score++;
    if (product.brand) score++;
    if (product.imagesCSV) score++;
    if (product.salesRanks) score++;
    if (product.stats && product.stats.salesRankDrops30) score++;
    if (product.stats && product.stats.current) score++;
    if (product.offers && product.offers.length > 0) score++;
    if (product.data && product.data[1]) score++; // Price history
    if (product.data && product.data[3]) score++; // Sales rank history
    if (product.reviewCount) score++;
    
    return { completeness: Math.round((score / maxScore) * 100) };
  }
  
  // Helper methods
  private parsePrice(priceData: any): number | null {
    if (!priceData || !Array.isArray(priceData) || priceData[1] === -1) {
      return null;
    }
    return priceData[1] / 100; // Convert from cents
  }
  
  private keepaTimeToDate(keepaTime: number): Date {
    // Keepa time is minutes since Keepa epoch (2011-01-01)
    const keepaEpoch = new Date('2011-01-01T00:00:00Z');
    return new Date(keepaEpoch.getTime() + keepaTime * 60 * 1000);
  }
  
  private countSalesDropsFromHistory(salesRankData: number[]): number {
    if (!salesRankData || salesRankData.length < 4) return 0;
    
    let drops = 0;
    for (let i = 2; i < salesRankData.length; i += 2) {
      const prevRank = salesRankData[i - 1];
      const currentRank = salesRankData[i + 1];
      
      if (prevRank !== -1 && currentRank !== -1 && currentRank < prevRank) {
        drops++;
      }
    }
    
    return drops;
  }
  
  private calculateMonthsOfHistoricalData(data: any): number {
    if (!data || !data[3] || data[3].length < 2) return 1;
    
    const firstTimestamp = data[3][0];
    const lastTimestamp = data[3][data[3].length - 2];
    
    if (!firstTimestamp || !lastTimestamp) return 1;
    
    const firstDate = this.keepaTimeToDate(firstTimestamp);
    const lastDate = this.keepaTimeToDate(lastTimestamp);
    
    const diffTime = Math.abs(lastDate.getTime() - firstDate.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
    
    return Math.max(diffMonths, 1);
  }
  
  private extractAllTimePrices(data: any): {
    avg365d: number | null;
    avgAllTime: number | null;
    lowestEver: number | null;
    highestEver: number | null;
  } {
    if (!data || !data[1] || data[1].length < 2) {
      return { avg365d: null, avgAllTime: null, lowestEver: null, highestEver: null };
    }
    
    const prices: number[] = [];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const prices365d: number[] = [];
    
    for (let i = 1; i < data[1].length; i += 2) {
      const timestamp = data[1][i - 1];
      const price = data[1][i];
      
      if (price !== -1) {
        const priceValue = price / 100;
        prices.push(priceValue);
        
        const date = this.keepaTimeToDate(timestamp);
        if (date >= oneYearAgo) {
          prices365d.push(priceValue);
        }
      }
    }
    
    const avg365d = prices365d.length > 0 ? 
      prices365d.reduce((a, b) => a + b, 0) / prices365d.length : null;
    
    const avgAllTime = prices.length > 0 ? 
      prices.reduce((a, b) => a + b, 0) / prices.length : null;
    
    const lowestEver = prices.length > 0 ? Math.min(...prices) : null;
    const highestEver = prices.length > 0 ? Math.max(...prices) : null;
    
    return { avg365d, avgAllTime, lowestEver, highestEver };
  }
  
  private calculatePriceChangeFrequency(priceHistory: Array<{date: Date, price: number}>): number {
    if (priceHistory.length < 2) return 0;
    
    let changes = 0;
    for (let i = 1; i < priceHistory.length; i++) {
      if (priceHistory[i].price !== priceHistory[i - 1].price) {
        changes++;
      }
    }
    
    const totalDays = Math.max(1, 
      (priceHistory[priceHistory.length - 1].date.getTime() - priceHistory[0].date.getTime()) / 
      (1000 * 60 * 60 * 24)
    );
    
    return changes / totalDays * 30; // Changes per month
  }
  
  private calculateReviewVelocity(data: any): number {
    // TODO: Implement review velocity calculation from rating history
    // This would require parsing review data if available
    return 0;
  }
  
  /**
   * Calculate token cost for comprehensive analysis
   */
  static calculateComprehensiveTokenCost(
    asinCount: number, 
    options: KeepaHistoricalOptions
  ): number {
    let costPerAsin = 2; // Base cost for comprehensive data
    
    if (options.includePriceHistory) costPerAsin += 2;
    if (options.includeOfferHistory) costPerAsin += 1;
    if (options.includeRankHistory) costPerAsin += 1;
    if (options.includeReviews) costPerAsin += 1;
    
    return costPerAsin * asinCount;
  }
}

export default KeepaComprehensiveAPI;