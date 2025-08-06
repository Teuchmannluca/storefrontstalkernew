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
  sellerName?: string;
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
  private currentTokens: number;
  private lastTokenUpdate: number;
  private readonly TOKENS_PER_MINUTE = 22;

  constructor(apiKey: string, domain: number = 2) {
    this.apiKey = apiKey;
    this.domain = domain;
    // Start with current available tokens (will be updated from API responses)
    this.currentTokens = 0; // Will be set from first API call
    this.lastTokenUpdate = Date.now();
    // Initialize rate limiter with realistic settings
    this.rateLimiter = new KeepaRateLimiter({
      tokensPerMinute: 22, // Real regeneration rate
      maxBurst: 500 // Max tokens you can have
    });
  }

  async getSellerASINs(sellerId: string, page: number = 0): Promise<KeepaSellerSearchResult> {
    // Seller search costs 50 tokens
    // Skip rate limiter for first call to get actual token count
    if (this.currentTokens === 0) {
      console.log('First API call - skipping rate limiter to get actual tokens');
    } else {
      await this.rateLimiter.consume(50);
    }
    
    try {
      const url = 'https://api.keepa.com/seller';
      const params = {
        key: this.apiKey,
        domain: this.domain,
        seller: sellerId,
        storefront: 1, // Request storefront ASINs
        update: 0, // Don't force update to save tokens
        page: page,
        perPage: 100, // Maximum allowed per page
        sort: 1, // Sort by sales rank
      };
      
      console.log('Fetching seller ASINs with params:', params);
      const response = await axios.get(url, { params });
      console.log('Seller ASINs response:', response.data);
      
      // Update token count from response and consume tokens
      this.updateTokensFromResponse(response);
      this.consumeTokens(50); // Each page costs 50 tokens
      
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
          
          // Log the seller data to see what we're getting
          console.log('Seller data keys:', Object.keys(sellerData));
          console.log('ASIN list length:', sellerData.asinList?.length || 0);
          console.log('Total storefront ASINs:', sellerData.totalStorefrontAsins);
          console.log('Seller name:', sellerData.sellerName);
          
          return {
            asinList: sellerData.asinList || [],
            totalResults: sellerData.totalStorefrontAsins?.[1] || sellerData.asinList?.length || 0,
            sellerName: sellerData.sellerName || null,
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
          console.log('Keepa API rate limit hit, waiting 60 seconds...');
          // Wait 60 seconds for rate limit reset
          await new Promise(resolve => setTimeout(resolve, 60000));
          // Retry once
          return this.getSellerASINs(sellerId, page);
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
    await this.rateLimiter.consume(1);
    
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
      
      // Update token count from response and consume 1 token
      this.updateTokensFromResponse(response);
      this.consumeTokens(1); // Seller info costs 1 token
      
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
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          console.log('Keepa API rate limit hit, waiting 60 seconds...');
          // Wait 60 seconds for rate limit reset
          await new Promise(resolve => setTimeout(resolve, 60000));
          // Retry once
          return this.getSellerInfo(sellerId);
        }
        if (error.response?.status === 402) {
          throw new Error('Insufficient Keepa API tokens. Please check your subscription.');
        }
      }
      console.error('Error fetching seller info:', error);
      throw error;
    }
  }

  private updateTokensFromResponse(response: any): void {
    // Update tokens from Keepa API response if available
    if (response.data && typeof response.data.tokensLeft === 'number') {
      this.currentTokens = response.data.tokensLeft;
      this.lastTokenUpdate = Date.now();
      console.log(`Updated tokens from Keepa API: ${this.currentTokens}`);
    }
  }

  private regenerateTokens(): void {
    // Regenerate tokens based on time passed (22 tokens per minute)
    const now = Date.now();
    const minutesPassed = (now - this.lastTokenUpdate) / (1000 * 60);
    const tokensToAdd = Math.floor(minutesPassed * this.TOKENS_PER_MINUTE);
    
    if (tokensToAdd > 0) {
      // Don't cap at 500 - use actual subscription limits
      this.currentTokens += tokensToAdd;
      this.lastTokenUpdate = now;
      console.log(`Regenerated ${tokensToAdd} tokens. Current: ${this.currentTokens}`);
    }
  }

  getAvailableTokens(): number {
    // Regenerate tokens based on time passed
    this.regenerateTokens();
    // If we haven't made any API calls yet, we don't know the real token count
    if (this.currentTokens === 0) {
      console.log('No API calls made yet - returning estimated tokens');
      return 100; // Return a reasonable estimate to allow first API call
    }
    return this.currentTokens;
  }

  consumeTokens(amount: number): void {
    this.currentTokens = Math.max(0, this.currentTokens - amount);
    console.log(`Consumed ${amount} tokens. Remaining: ${this.currentTokens}`);
  }

  initializeTokensFromAPI(): void {
    // Initialize tokens from the first API call - don't reset artificially
    console.log('🔄 Will initialize tokens from first Keepa API response');
  }
}

export default KeepaStorefrontAPI;