import axios from 'axios';

interface KeepaProduct {
  asin: string;
  title: string;
  brand: string;
  imagesCSV: string;
  salesRanks: { [key: string]: number };
  categories: number[];
  categoryTree: Array<{ name: string; catId: number }>;
}

interface ProductDetails {
  asin: string;
  title: string;
  brand: string;
  mainImage: string;
  salesRank: number | null;
  salesRankCategory: string | null;
}

export interface KeepaProductStats {
  asin: string;
  title: string;
  brand: string;
  mainImage: string;
  salesRank: number | null;
  salesRankCategory: string | null;
  salesDrops30d: number;
  salesDrops90d: number;
  estimatedMonthlySales: number;
  buyBoxWinRate: number | null;
  competitorCount: number;
  currentPrice: number | null;
  avgPrice30d: number | null;
  minPrice30d: number | null;
  maxPrice30d: number | null;
  outOfStockPercentage: number | null;
}

export interface KeepaGraphOptions {
  width?: number;
  height?: number;
  range?: number; // days
  amazon?: boolean;
  new?: boolean;
  used?: boolean;
  salesRank?: boolean;
  listPrice?: boolean;
  buyBox?: boolean;
}

export class KeepaAPI {
  private apiKey: string;
  private domain: number;
  
  constructor(apiKey: string, domain: number = 2) { // 2 = UK
    this.apiKey = apiKey;
    this.domain = domain;
  }
  
  async getProductByASIN(asin: string): Promise<ProductDetails | null> {
    try {
      const url = 'https://api.keepa.com/product';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        asin: asin,
        stats: 1, // Include statistics
        history: 0, // Don't need price history
      };
      
      const response = await axios.get(url, { params });
      
      if (response.data && response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        return this.parseKeepaProduct(product);
      }
      
      return null;
    } catch (error) {
      console.error('Keepa API error:', error);
      throw error;
    }
  }
  
  async getProductsByASINs(asins: string[]): Promise<ProductDetails[]> {
    try {
      const url = 'https://api.keepa.com/product';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        asin: asins.join(','),
        stats: 1,
        history: 0,
      };
      
      const response = await axios.get(url, { params });
      
      if (response.data && response.data.products) {
        return response.data.products.map((product: any) => this.parseKeepaProduct(product));
      }
      
      return [];
    } catch (error) {
      console.error('Keepa API error:', error);
      throw error;
    }
  }
  
  private parseKeepaProduct(product: any): ProductDetails {
    // Extract title
    const title = product.title || 'Unknown Product';
    
    // Extract brand
    const brand = product.brand || null;
    
    // Extract main image
    let mainImage = '';
    if (product.imagesCSV) {
      const images = product.imagesCSV.split(',');
      if (images.length > 0) {
        mainImage = `https://images-na.ssl-images-amazon.com/images/I/${images[0]}`;
      }
    }
    
    // Extract sales rank
    let salesRank = null;
    let salesRankCategory = null;
    
    if (product.salesRanks) {
      // Get the main category sales rank (usually the first one)
      const ranks = Object.entries(product.salesRanks);
      if (ranks.length > 0) {
        const [categoryId, rank] = ranks[0];
        salesRank = rank as number;
        
        // Try to get category name
        if (product.categoryTree && product.categoryTree.length > 0) {
          salesRankCategory = product.categoryTree[0].name;
        } else {
          salesRankCategory = `Category ${categoryId}`;
        }
      }
    }
    
    return {
      asin: product.asin,
      title,
      brand,
      mainImage,
      salesRank,
      salesRankCategory,
    };
  }

  async getProductWithStats(asin: string): Promise<KeepaProductStats | null> {
    try {
      const url = 'https://api.keepa.com/product';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        asin: asin,
        stats: 90, // Get 90 days of statistics
        history: 0, // Don't need full price history data
        offers: 20, // Get current offers to count competitors
        buybox: 1,  // Get Buy Box data
      };
      
      const response = await axios.get(url, { params });
      
      if (response.data && response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        return this.parseKeepaProductStats(product);
      }
      
      return null;
    } catch (error) {
      console.error('Keepa API error:', error);
      throw error;
    }
  }

  async getBatchProductStats(asins: string[]): Promise<KeepaProductStats[]> {
    try {
      // Keepa allows up to 100 ASINs per request
      const batchSize = 100;
      const results: KeepaProductStats[] = [];
      
      for (let i = 0; i < asins.length; i += batchSize) {
        const batch = asins.slice(i, i + batchSize);
        const url = 'https://api.keepa.com/product';
        const params = {
          key: this.apiKey,
          domain: this.domain,
          asin: batch.join(','),
          stats: 90,
          history: 0,
          offers: 20,
          buybox: 1,
        };
        
        const response = await axios.get(url, { params });
        
        if (response.data && response.data.products) {
          const batchResults = response.data.products.map((product: any) => 
            this.parseKeepaProductStats(product)
          );
          results.push(...batchResults);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Keepa API batch error:', error);
      throw error;
    }
  }

  private parseKeepaProductStats(product: any): KeepaProductStats {
    // Parse basic details but handle salesRank array
    let basicDetails = this.parseKeepaProduct(product);
    
    // If salesRank came as an array from the stored data, extract the first value
    if (Array.isArray(basicDetails.salesRank)) {
      basicDetails.salesRank = basicDetails.salesRank[0] || null;
    }
    
    // Extract sales statistics
    const stats = product.stats || {};
    const salesDrops30d = stats.salesRankDrops30 || 0;
    const salesDrops90d = stats.salesRankDrops90 || 0;
    
    // Estimate monthly sales (90-day average)
    const estimatedMonthlySales = Math.round(salesDrops90d / 3);
    
    // Extract Buy Box win rate
    let buyBoxWinRate = null;
    let competitorCount = 0;
    
    if (stats.buyBoxStats) {
      const buyBoxStats = stats.buyBoxStats;
      competitorCount = Object.keys(buyBoxStats).length;
      
      // Find the highest win rate (could be used to identify dominant seller)
      const winRates = Object.values(buyBoxStats).map((s: any) => s.percentageWon || 0);
      if (winRates.length > 0) {
        buyBoxWinRate = Math.max(...winRates);
      }
    }
    
    // Count current offers as competitors
    if (product.offers && product.offers.length > 0) {
      competitorCount = Math.max(competitorCount, product.offers.length);
    }
    
    // Extract pricing data
    let currentPrice = null;
    let avgPrice30d = null;
    let minPrice30d = null;
    let maxPrice30d = null;
    
    if (stats.current && stats.current[1] !== -1) {
      currentPrice = stats.current[1] / 100; // Convert from cents
    }
    
    if (stats.avg30 && stats.avg30[1] !== -1) {
      avgPrice30d = stats.avg30[1] / 100;
    }
    
    if (stats.min30 && stats.min30[1] !== -1) {
      minPrice30d = stats.min30[1] / 100;
    }
    
    if (stats.max30 && stats.max30[1] !== -1) {
      maxPrice30d = stats.max30[1] / 100;
    }
    
    // Out of stock percentage (handle both single value and array)
    let outOfStockPercentage = null;
    if (stats.outOfStockPercentage30 !== undefined) {
      if (Array.isArray(stats.outOfStockPercentage30)) {
        // If it's an array, calculate the average percentage
        const validValues = stats.outOfStockPercentage30.filter((v: number) => v >= 0 && v <= 100);
        if (validValues.length > 0) {
          outOfStockPercentage = validValues.reduce((a: number, b: number) => a + b, 0) / validValues.length;
        }
      } else {
        outOfStockPercentage = stats.outOfStockPercentage30;
      }
    }
    
    return {
      ...basicDetails,
      salesDrops30d,
      salesDrops90d,
      estimatedMonthlySales,
      buyBoxWinRate,
      competitorCount,
      currentPrice,
      avgPrice30d,
      minPrice30d,
      maxPrice30d,
      outOfStockPercentage,
    };
  }

  generateGraphUrl(asin: string, options: KeepaGraphOptions = {}): string {
    const defaultOptions = {
      width: 500,
      height: 200,
      range: 90, // 90 days by default
      amazon: true,
      new: true,
      used: false,
      salesRank: true,
      listPrice: false,
      buyBox: true,
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    // Build the graph URL
    const params = new URLSearchParams({
      asin,
      domain: this.domain.toString(),
      width: finalOptions.width!.toString(),
      height: finalOptions.height!.toString(),
      range: finalOptions.range!.toString(),
      key: this.apiKey,
    });
    
    // Add price type flags (1 for true, 0 for false)
    if (finalOptions.amazon) params.append('amazon', '1');
    if (finalOptions.new) params.append('new', '1');
    if (finalOptions.used) params.append('used', '1');
    if (finalOptions.salesRank) params.append('salesrank', '1');
    if (finalOptions.listPrice) params.append('listprice', '1');
    if (finalOptions.buyBox) params.append('buybox', '1');
    
    return `https://graph.keepa.com/pricehistory.png?${params.toString()}`;
  }

  // Calculate token cost for operations
  static calculateTokenCost(operation: 'product' | 'graph' | 'both', asinCount: number): number {
    const costs = {
      product: 1,
      graph: 1,
      both: 2,
    };
    
    return costs[operation] * asinCount;
  }
}

export default KeepaAPI;