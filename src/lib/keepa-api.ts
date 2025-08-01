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
}

export default KeepaAPI;