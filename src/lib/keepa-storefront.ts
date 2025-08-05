import axios from 'axios';
import { KeepaRateLimiter } from './keepa-rate-limiter';

interface SellerInfo {
  sellerId: string;
  name: string;
  tokens: number;
}

interface KeepaSellerSearchResult {
  asinList: string[];
  totalResults: number;
  tokenInfo?: {
    tokensLeft: number;
    tokensConsumed: number;
    tokenFlowReduction: number;
    timestamp: number;
  };
}

export class KeepaStorefrontAPI {
  private apiKey: string;
  private domain: number;
  private rateLimiter: KeepaRateLimiter;
  
  constructor(apiKey: string, domain: number = 2) {
    this.apiKey = apiKey;
    this.domain = domain;
    // Initialize rate limiter with 20 tokens per minute
    this.rateLimiter = new KeepaRateLimiter({
      tokensPerMinute: 20,
      maxBurst: 20
    });
  }

  async getSellerASINs(sellerId: string, page: number = 0): Promise<KeepaSellerSearchResult> {
    // Seller search costs 50 tokens
    // Rate limiting temporarily disabled for testing
    // await this.rateLimiter.consume(50);
    
    try {
      const url = 'https://api.keepa.com/seller';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        seller: sellerId,
        storefront: 1, // Request storefront ASINs
        update: 1, // Force update to get latest data
        page: page,
        perPage: 100, // Maximum allowed per page
        sort: 1, // Sort by sales rank
      };
      
      console.log('Fetching seller ASINs with params:', params);
      const response = await axios.get(url, { params });
      console.log('Seller ASINs response:', response.data);
      
      if (response.data && response.data.sellers) {
        // Keepa returns sellers as an object keyed by seller ID, not an array
        const sellerIds = Object.keys(response.data.sellers);
        if (sellerIds.length > 0) {
          const sellerData = response.data.sellers[sellerIds[0]];
          
          // Extract token information from response
          const tokenInfo = response.data.tokensLeft !== undefined ? {
            tokensLeft: response.data.tokensLeft,
            tokensConsumed: response.data.tokensConsumed || 0,
            tokenFlowReduction: response.data.tokenFlowReduction || 0,
            timestamp: response.data.timestamp || Date.now()
          } : undefined;
          
          return {
            asinList: sellerData.asinList || [],
            totalResults: sellerData.totalStorefrontAsins?.[1] || sellerData.asinList?.length || 0,
            tokenInfo
          };
        }
      }
      
      return {
        asinList: [],
        totalResults: 0
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Keepa API rate limit exceeded. Please wait before retrying.');
        }
        if (error.response?.status === 402) {
          throw new Error('Insufficient Keepa API tokens. Please check your subscription.');
        }
      }
      throw error;
    }
  }

  async getAllSellerASINs(sellerId: string, maxPages: number = 10): Promise<string[]> {
    const allASINs: string[] = [];
    let page = 0;
    let hasMore = true;
    
    while (hasMore && page < maxPages) {
      try {
        const result = await this.getSellerASINs(sellerId, page);
        
        if (result.asinList.length === 0) {
          hasMore = false;
        } else {
          allASINs.push(...result.asinList);
          
          // Check if we've retrieved all results
          if (allASINs.length >= result.totalResults) {
            hasMore = false;
          } else {
            page++;
          }
        }
      } catch (error) {
        console.error(`Error fetching page ${page} for seller ${sellerId}:`, error);
        throw error;
      }
    }
    
    return allASINs;
  }

  async getSellerInfo(sellerId: string): Promise<SellerInfo | null> {
    // Seller info lookup costs 1 token
    // Rate limiting temporarily disabled for testing
    // await this.rateLimiter.consume(1);
    
    try {
      const url = 'https://api.keepa.com/seller';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        seller: sellerId,
        // No storefront or update params for basic info
      };
      
      console.log('Fetching seller info with params:', params);
      const response = await axios.get(url, { params });
      console.log('Seller info response:', response.data);
      
      if (response.data && response.data.sellers) {
        // Keepa returns sellers as an object keyed by seller ID, not an array
        const sellerIds = Object.keys(response.data.sellers);
        if (sellerIds.length > 0) {
          const sellerData = response.data.sellers[sellerIds[0]];
          return {
            sellerId: sellerData.sellerId,
            name: sellerData.sellerName || 'Unknown Seller',
            tokens: response.data.tokensLeft || 0
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching seller info:', error);
      throw error;
    }
  }

  getAvailableTokens(): number {
    return this.rateLimiter.getAvailableTokens();
  }
}

export default KeepaStorefrontAPI;