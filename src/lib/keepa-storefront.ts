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
  private keepaTimestamp: number = 0; // Timestamp from Keepa API response
  private readonly TOKENS_PER_MINUTE = 20;
  private lastApiCallTime: number = 0;
  private readonly MIN_TIME_BETWEEN_CALLS = 2750; // ~2.75 seconds between calls for safety
  private hasInitialized: boolean = false; // Track if we've made first API call

  constructor(apiKey: string, domain: number = 2) {
    this.apiKey = apiKey;
    this.domain = domain;
    // Start with no token knowledge until first API call
    this.currentTokens = 0;
    this.keepaTimestamp = 0;
    this.hasInitialized = false;
  }

  async getSellerASINs(sellerId: string, page: number = 0): Promise<KeepaSellerSearchResult> {
    // Enforce minimum time between API calls (but not for the very first call)
    if (this.hasInitialized) {
      await this.enforceRateLimit();
    }
    
    // Only check tokens if we've initialized (know our real token count)
    if (this.hasInitialized) {
      const availableTokens = this.getAvailableTokens();
      if (availableTokens < 50) {
        const tokensNeeded = 50 - availableTokens;
        const waitTime = Math.ceil(tokensNeeded / this.TOKENS_PER_MINUTE * 60 * 1000);
        console.log(`Insufficient tokens: ${availableTokens}/50 available. Need ${tokensNeeded} more tokens.`);
        console.log(`Waiting ${Math.ceil(waitTime / 1000)} seconds for token regeneration...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } else {
      console.log('First API call - will learn token count from response');
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
    // Enforce minimum time between API calls (but not for the very first call)
    if (this.hasInitialized) {
      await this.enforceRateLimit();
    }
    
    // Only check tokens if we've initialized
    if (this.hasInitialized) {
      const availableTokens = this.getAvailableTokens();
      if (availableTokens < 1) {
        const waitTime = Math.ceil(1 / this.TOKENS_PER_MINUTE * 60 * 1000);
        console.log(`Insufficient tokens: ${availableTokens}/1 available.`);
        console.log(`Waiting ${Math.ceil(waitTime / 1000)} seconds for token regeneration...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
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
      this.currentTokens = Math.max(0, response.data.tokensLeft);
      
      // Use Keepa's timestamp if provided, otherwise use current time
      if (response.data.timestamp) {
        this.keepaTimestamp = response.data.timestamp;
      } else {
        this.keepaTimestamp = Date.now();
      }
      
      this.lastApiCallTime = Date.now();
      this.hasInitialized = true;
      
      console.log(`Updated tokens from Keepa API:`);
      console.log(`  Tokens left: ${this.currentTokens}`);
      console.log(`  Tokens consumed: ${response.data.tokensConsumed || 'N/A'}`);
      console.log(`  Timestamp: ${new Date(this.keepaTimestamp).toISOString()}`);
      
      // Calculate how many storefront requests we can make
      const possibleRequests = Math.floor(this.currentTokens / 50);
      console.log(`  Can make ${possibleRequests} more storefront requests before waiting`);
      
      // Warn if tokens are getting low
      if (this.currentTokens < 100) {
        console.warn(`⚠️ Low token count: ${this.currentTokens} tokens remaining`);
      }
    }
  }

  private regenerateTokens(): void {
    // Don't regenerate if we haven't made any API calls yet
    if (!this.hasInitialized || this.keepaTimestamp === 0) {
      return;
    }
    
    // Regenerate tokens based on time passed since Keepa's timestamp
    const now = Date.now();
    const minutesPassed = (now - this.keepaTimestamp) / (1000 * 60);
    const tokensRegenerated = Math.floor(minutesPassed * this.TOKENS_PER_MINUTE);
    
    if (tokensRegenerated > 0) {
      // Update timestamp to account for regenerated tokens
      const minutesAccountedFor = tokensRegenerated / this.TOKENS_PER_MINUTE;
      this.keepaTimestamp += minutesAccountedFor * 60 * 1000;
      
      // Cap at a reasonable maximum (most Keepa plans have daily limits)
      const maxTokens = 5000; // Reasonable cap for most plans
      const newTokenCount = Math.min(maxTokens, this.currentTokens + tokensRegenerated);
      const actualRegenerated = newTokenCount - this.currentTokens;
      
      this.currentTokens = newTokenCount;
      
      if (actualRegenerated > 0) {
        console.log(`Regenerated ${actualRegenerated} tokens. Current: ${this.currentTokens}`);
      }
    }
  }

  getAvailableTokens(): number {
    // If we haven't initialized, we don't know token count
    if (!this.hasInitialized) {
      return 0; // Will be updated after first API call
    }
    
    // Regenerate tokens based on time passed
    this.regenerateTokens();
    return Math.max(0, this.currentTokens);
  }

  private async enforceRateLimit(): Promise<void> {
    // Ensure minimum time between API calls to avoid hitting rate limits
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    if (timeSinceLastCall < this.MIN_TIME_BETWEEN_CALLS) {
      const waitTime = this.MIN_TIME_BETWEEN_CALLS - timeSinceLastCall;
      console.log(`Rate limiting: waiting ${Math.ceil(waitTime / 1000)}s before next API call`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // After we know our token count, add dynamic pacing
    if (this.hasInitialized && this.currentTokens < 150) {
      // If tokens are low, add extra delay to allow regeneration
      const extraDelay = Math.max(0, (150 - this.currentTokens) * 100); // 100ms per token below 150
      if (extraDelay > 0) {
        console.log(`Low tokens (${this.currentTokens}), adding ${extraDelay}ms extra delay`);
        await new Promise(resolve => setTimeout(resolve, extraDelay));
      }
    }
  }

  consumeTokens(amount: number): void {
    // No-op: Keepa automatically deducts tokens server-side
    // Token count is updated from API responses only
    console.log(`Token consumption handled by Keepa API (requested: ${amount} tokens)`);
  }

  initializeTokensFromAPI(): void {
    // Initialize tokens from the first API call - don't reset artificially
    console.log('🔄 Will initialize tokens from first Keepa API response');
  }
}

export default KeepaStorefrontAPI;