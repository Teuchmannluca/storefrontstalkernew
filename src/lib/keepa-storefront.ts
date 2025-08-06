import axios from 'axios';

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
  private currentTokens: number;
  private lastTokenUpdate: number;
  private readonly TOKENS_PER_MINUTE = 22;
  private lastApiCallTime: number = 0;
  private readonly MIN_TIME_BETWEEN_CALLS = 3000; // 3 seconds minimum between API calls

  constructor(apiKey: string, domain: number = 2) {
    this.apiKey = apiKey;
    this.domain = domain;
    // Start with current available tokens (will be updated from API responses)
    this.currentTokens = 0; // Will be set from first API call
    this.lastTokenUpdate = Date.now();
  }

  async getSellerASINs(sellerId: string, page: number = 0): Promise<KeepaSellerSearchResult> {
    // Enforce minimum time between API calls
    await this.enforceRateLimit();
    
    // Seller search costs 50 tokens
    // Check if we have enough tokens before making the call
    const availableTokens = this.getAvailableTokens();
    if (availableTokens < 50) {
      const tokensNeeded = 50 - availableTokens;
      const waitTime = Math.ceil(tokensNeeded / this.TOKENS_PER_MINUTE * 60 * 1000);
      console.log(`Insufficient tokens: ${availableTokens}/50 available. Need ${tokensNeeded} more tokens.`);
      console.log(`Waiting ${Math.ceil(waitTime / 1000)} seconds for token regeneration...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
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
      
      // Update token count from response (only consume tokens on successful request)
      this.updateTokensFromResponse(response);
      
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
    // Enforce minimum time between API calls
    await this.enforceRateLimit();
    
    // Seller info lookup costs 1 token
    const availableTokens = this.getAvailableTokens();
    if (availableTokens < 1) {
      const waitTime = Math.ceil(1 / this.TOKENS_PER_MINUTE * 60 * 1000);
      console.log(`Insufficient tokens: ${availableTokens}/1 available.`);
      console.log(`Waiting ${Math.ceil(waitTime / 1000)} seconds for token regeneration...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
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
      
      // Update token count from response (tokens are automatically deducted by Keepa)
      this.updateTokensFromResponse(response);
      
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
      this.currentTokens = Math.max(0, response.data.tokensLeft); // Never allow negative tokens
      this.lastTokenUpdate = Date.now();
      this.lastApiCallTime = Date.now();
      console.log(`Updated tokens from Keepa API: ${this.currentTokens}`);
      
      // Warn if tokens are getting low
      if (this.currentTokens < 100) {
        console.warn(`⚠️ Low token count: ${this.currentTokens} tokens remaining`);
      }
    }
  }

  private regenerateTokens(): void {
    // Don't regenerate if we haven't made any API calls yet
    if (this.lastTokenUpdate === 0) {
      return;
    }
    
    // Regenerate tokens based on time passed (22 tokens per minute)
    const now = Date.now();
    const minutesPassed = (now - this.lastTokenUpdate) / (1000 * 60);
    const tokensToAdd = Math.floor(minutesPassed * this.TOKENS_PER_MINUTE);
    
    if (tokensToAdd > 0) {
      // Cap at a reasonable maximum (most Keepa plans have daily limits)
      const maxTokens = 5000; // Reasonable cap for most plans
      this.currentTokens = Math.min(maxTokens, Math.max(0, this.currentTokens + tokensToAdd));
      this.lastTokenUpdate = now;
      console.log(`Regenerated ${tokensToAdd} tokens. Current: ${this.currentTokens}`);
    }
  }

  getAvailableTokens(): number {
    // Regenerate tokens based on time passed
    this.regenerateTokens();
    // If we haven't made any API calls yet, assume we have some tokens
    if (this.lastTokenUpdate === 0) {
      console.log('No API calls made yet - assuming initial tokens available');
      return 100; // Assume we have tokens for first call
    }
    return Math.max(0, this.currentTokens); // Never return negative
  }

  private async enforceRateLimit(): Promise<void> {
    // Ensure minimum time between API calls to avoid hitting rate limits
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    if (timeSinceLastCall < this.MIN_TIME_BETWEEN_CALLS) {
      const waitTime = this.MIN_TIME_BETWEEN_CALLS - timeSinceLastCall;
      console.log(`Rate limiting: waiting ${waitTime}ms before next API call`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
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