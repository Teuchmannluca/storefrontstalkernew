import crypto from 'crypto';
import axios from 'axios';

// Type definitions for Competitive Pricing API
export interface CompetitivePricingRequest {
  marketplaceId: string;
  asins?: string[];
  skus?: string[];
  itemType?: 'Asin' | 'Sku';
  customerType?: 'Consumer' | 'Business';
}

export interface CompetitivePriceType {
  competitivePriceId: string;
  price: MoneyType;
  condition?: string;
  subcondition?: string;
  offerType?: 'B2C' | 'B2B';
  quantityTier?: number;
  quantityDiscountType?: string;
  sellerId?: string;
  belongsToRequester?: boolean;
}

export interface MoneyType {
  currencyCode: string;
  amount: number;
}

export interface SalesRankType {
  productCategoryId: string;
  rank: number;
}

export interface OfferType {
  offerType: 'B2C' | 'B2B';
  price: MoneyType;
  shippingPrice?: MoneyType;
  points?: Points;
  shippingTime: {
    minimumHours?: number;
    maximumHours?: number;
    availabilityType?: string;
  };
  sellerFeedbackRating?: {
    feedbackCount: number;
    sellerPositiveFeedbackRating: number;
  };
  subCondition: string;
  sellerId: string;
  conditionNotes?: string;
  primeInformation?: {
    isPrime: boolean;
    isNationalPrime: boolean;
  };
  isBuyBoxWinner?: boolean;
  isFeaturedMerchant?: boolean;
}

export interface Points {
  pointsNumber: number;
  pointsMonetaryValue: MoneyType;
}

export interface Summary {
  totalOfferCount: number;
  numberOfOffers?: Array<{
    condition: string;
    offerCount: number;
  }>;
  lowestPrices?: Array<{
    condition: string;
    fulfillmentChannel: string;
    landedPrice: MoneyType;
    listingPrice: MoneyType;
    shipping: MoneyType;
    points?: Points;
  }>;
  buyBoxPrices?: Array<{
    condition: string;
    offerType: 'B2C' | 'B2B';
    landedPrice: MoneyType;
    listingPrice: MoneyType;
    shipping: MoneyType;
    points?: Points;
  }>;
  listPrice?: MoneyType;
  competitivePriceThreshold?: MoneyType;
  suggestedLowerPricePlusShipping?: MoneyType;
  salesRankings?: SalesRankType[];
  buyBoxEligibleOffers?: Array<{
    condition: string;
    offerCount: number;
  }>;
  offersAvailableTime?: string;
}

export interface Product {
  identifiers: {
    marketplaceId: string;
    asin?: string;
    sku?: string;
    itemCondition?: string;
    customerType?: string;
  };
  marketplaceId: string;
  asin?: string;
  sku?: string;
  offers?: OfferType[];
  summary?: Summary;
  competitivePricing?: {
    competitivePrices: CompetitivePriceType[];
    numberOfOfferListings: Array<{
      condition: string;
      count: number;
    }>;
    tradeInValue?: MoneyType;
  };
  salesRankings?: SalesRankType[];
}

export interface ItemOffersRequest {
  uri: string;
  method: 'GET';
  marketplaceId: string;
  itemCondition: 'New' | 'Used' | 'Collectible' | 'Refurbished' | 'All';
  customerType?: 'Consumer' | 'Business' | 'All';
  asin?: string;
}

export interface BatchOffersRequestParams {
  requests: ItemOffersRequest[];
}

export interface BatchOffersResponse {
  responses: Array<{
    status: {
      statusCode: number;
      reasonPhrase: string;
    };
    headers: { [key: string]: string };
    request: ItemOffersRequest;
    body?: {
      payload?: Product;
      errors?: Array<{
        code: string;
        message: string;
        details?: string;
      }>;
    };
  }>;
}

// Rate limiter for Competitive Pricing API
// Different endpoints have different rate limits
class CompetitivePricingRateLimiter {
  private queues: Map<string, Array<() => void>> = new Map();
  private processing: Map<string, boolean> = new Map();
  private lastRequestTime: Map<string, number> = new Map();
  
  // Rate limits per endpoint
  // Updated to match actual SP-API limits for competitive pricing
  private rateLimits = {
    getCompetitivePricing: { rate: 0.5, burst: 2 }, // 0.5 req/sec (1 per 2 seconds) to stay under quota
    getItemOffers: { rate: 0.5, burst: 2 }, // 0.5 req/sec
    getItemOffersBatch: { rate: 0.5, burst: 2 } // 0.5 req/sec
  };

  async acquire(endpoint: keyof typeof this.rateLimits): Promise<void> {
    return new Promise((resolve) => {
      if (!this.queues.has(endpoint)) {
        this.queues.set(endpoint, []);
        this.processing.set(endpoint, false);
        this.lastRequestTime.set(endpoint, 0);
      }
      
      const queue = this.queues.get(endpoint)!;
      queue.push(resolve);
      this.process(endpoint);
    });
  }

  private async process(endpoint: keyof typeof this.rateLimits) {
    const queue = this.queues.get(endpoint)!;
    const isProcessing = this.processing.get(endpoint);
    
    if (isProcessing || queue.length === 0) return;
    
    this.processing.set(endpoint, true);
    
    const rateLimit = this.rateLimits[endpoint];
    const minInterval = 1000 / rateLimit.rate; // Convert to milliseconds
    
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(endpoint) || 0;
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }
    
    const resolve = queue.shift();
    if (resolve) {
      this.lastRequestTime.set(endpoint, Date.now());
      resolve();
    }
    
    this.processing.set(endpoint, false);
    
    // Process next item in queue
    if (queue.length > 0) {
      setTimeout(() => this.process(endpoint), 0);
    }
  }
}

const competitivePricingRateLimiter = new CompetitivePricingRateLimiter();

export class SPAPICompetitivePricingClient {
  private credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
  };
  
  private config: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    marketplaceId: string;
    region: 'na' | 'eu' | 'fe';
  };
  
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  constructor(
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      region: string;
    },
    config: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      marketplaceId: string;
      region: 'na' | 'eu' | 'fe';
    }
  ) {
    this.credentials = credentials;
    this.config = config;
  }
  
  private getEndpoint(): string {
    const endpoints = {
      na: 'https://sellingpartnerapi-na.amazon.com',
      eu: 'https://sellingpartnerapi-eu.amazon.com',
      fe: 'https://sellingpartnerapi-fe.amazon.com'
    };
    return endpoints[this.config.region];
  }
  
  private getTokenEndpoint(): string {
    return 'https://api.amazon.com/auth/o2/token';
  }
  
  private async getAccessToken(): Promise<string> {
    const tokenUrl = this.getTokenEndpoint();
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });
    
    try {
      console.log('Getting SP-API access token from:', tokenUrl);
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const { access_token, expires_in } = response.data;
      console.log('Got access token, expires in:', expires_in, 'seconds');
      this.accessToken = access_token;
      this.tokenExpiry = new Date(Date.now() + (expires_in - 60) * 1000);
      
      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('Token error details:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to get access token: ${error.response?.data?.error_description || error.message}`);
    }
  }
  
  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
      return await this.getAccessToken();
    }
    return this.accessToken;
  }
  
  private createCanonicalRequest(
    method: string,
    path: string,
    queryParams: string,
    headers: { [key: string]: string },
    payload: string
  ): string {
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key].trim()}`)
      .join('\n');
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    
    return [
      method,
      path,
      queryParams,
      canonicalHeaders,
      '',
      signedHeaders,
      hashedPayload
    ].join('\n');
  }
  
  private createStringToSign(
    timestamp: string,
    region: string,
    service: string,
    canonicalRequest: string
  ): string {
    const date = timestamp.substring(0, 8);
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    
    return [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
  }
  
  private calculateSignature(
    secretKey: string,
    date: string,
    region: string,
    service: string,
    stringToSign: string
  ): string {
    const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    
    return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }
  
  private async makeRequest(
    method: string,
    path: string,
    queryParams: { [key: string]: string } = {},
    body: any = null
  ): Promise<any> {
    const accessToken = await this.ensureValidToken();
    const endpoint = this.getEndpoint();
    const url = new URL(path, endpoint);
    
    // Add query parameters
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    console.log('Query params:', queryParams);
    console.log('Full URL will be:', url.toString());
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substring(0, 8);
    const payload = body ? JSON.stringify(body) : '';
    
    // Headers that must be included in the signature
    const signatureHeaders: { [key: string]: string } = {
      'host': url.hostname,
      'x-amz-access-token': accessToken,
      'x-amz-date': timestamp,
      'content-type': 'application/json'
    };
    
    if (this.credentials.sessionToken) {
      signatureHeaders['x-amz-security-token'] = this.credentials.sessionToken;
    }
    
    const queryString = url.search.substring(1);
    console.log('Query string for signature:', queryString);
    
    const canonicalRequest = this.createCanonicalRequest(
      method,
      url.pathname,
      queryString,
      signatureHeaders,
      payload
    );
    
    console.log('Canonical Request:\n', canonicalRequest);
    
    const stringToSign = this.createStringToSign(
      timestamp,
      this.credentials.region,
      'execute-api',
      canonicalRequest
    );
    
    const signature = this.calculateSignature(
      this.credentials.secretAccessKey,
      date,
      this.credentials.region,
      'execute-api',
      stringToSign
    );
    
    const signedHeaders = Object.keys(signatureHeaders)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    // Build all headers for the request (including those not in signature)
    const headers: { [key: string]: string } = {
      ...signatureHeaders,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${date}/${this.credentials.region}/execute-api/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'user-agent': 'StorefrontTracker/1.0'
    };
    
    console.log('Authorization header:', headers['Authorization']);
    console.log('Signed headers:', signedHeaders);
    
    try {
      console.log(`SP-API Request: ${method} ${url.toString()}`);
      console.log('Request details:', {
        method,
        url: url.toString(),
        pathname: url.pathname,
        search: url.search,
        queryParams: Object.fromEntries(url.searchParams)
      });
      console.log('Headers:', Object.keys(headers).reduce((acc, key) => {
        if (key === 'Authorization') {
          acc[key] = 'AWS4-HMAC-SHA256 ***';
        } else if (key === 'x-amz-access-token') {
          acc[key] = '***';
        } else {
          acc[key] = headers[key];
        }
        return acc;
      }, {} as any));
      
      const response = await axios({
        method,
        url: url.toString(),
        headers,
        ...(method !== 'GET' && body ? { data: body } : {})
      });
      
      console.log('SP-API Response Status:', response.status);
      console.log('SP-API Response Data:', response.data);
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error('API Error Status:', error.response.status);
        console.error('API Error Headers:', error.response.headers);
        console.error('API Error Data:', error.response.data);
        
        // Check if it's an HTML error page
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          console.error('Received HTML instead of JSON - likely wrong endpoint');
          console.error('Full URL attempted:', error.config?.url);
          console.error('HTML response:', error.response.data);
          throw new Error(`SP-API Error: Wrong endpoint (${error.response.status})`);
        }
        
        // Check for specific error messages
        const errorData = error.response.data;
        if (errorData && errorData.errors) {
          console.error('SP-API Errors:', errorData.errors);
          throw new Error(`SP-API Error: ${errorData.errors[0]?.message || error.response.status}`);
        }
        
        throw new Error(`SP-API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  /**
   * Get competitive pricing for a list of ASINs
   * Maximum 20 ASINs per request
   */
  async getCompetitivePricing(
    asins: string[],
    marketplaceId?: string,
    itemType: 'Asin' | 'Sku' = 'Asin',
    customerType?: 'Consumer' | 'Business'
  ): Promise<Product[]> {
    await competitivePricingRateLimiter.acquire('getCompetitivePricing');
    
    if (asins.length > 20) {
      throw new Error('Maximum 20 ASINs per request');
    }
    
    const queryParams: any = {
      MarketplaceId: marketplaceId || this.config.marketplaceId,
      ItemType: itemType,
      Asins: asins.join(',')
    };
    
    try {
      const response = await this.makeRequest(
        'GET',
        '/products/pricing/v0/competitivePrice',
        queryParams
      );
      
      // Transform v0 API response to our Product format
      const products: Product[] = [];
      if (response.payload && Array.isArray(response.payload)) {
        for (const item of response.payload) {
          if (item.status === 'Success' && item.Product) {
            const product: Product = {
              identifiers: {
                marketplaceId: item.Product.Identifiers?.MarketplaceASIN?.MarketplaceId || marketplaceId || this.config.marketplaceId,
                asin: item.ASIN || item.Product.Identifiers?.MarketplaceASIN?.ASIN,
                itemCondition: 'New',
                customerType: customerType || 'Consumer'
              },
              marketplaceId: item.Product.Identifiers?.MarketplaceASIN?.MarketplaceId || marketplaceId || this.config.marketplaceId,
              asin: item.ASIN || item.Product.Identifiers?.MarketplaceASIN?.ASIN,
              competitivePricing: item.Product.CompetitivePricing,
              salesRankings: item.Product.SalesRankings
            };
            products.push(product);
          }
        }
      }
      
      return products;
    } catch (error: any) {
      console.error('Competitive pricing error:', error);
      throw error;
    }
  }
  
  /**
   * Get item offers for a single ASIN
   */
  async getItemOffers(
    asin: string,
    marketplaceId?: string,
    itemCondition: 'New' | 'Used' | 'Collectible' | 'Refurbished' | 'All' = 'New',
    customerType?: 'Consumer' | 'Business' | 'All'
  ): Promise<Product> {
    // Use getCompetitivePricing for a single ASIN
    const products = await this.getCompetitivePricing([asin], marketplaceId);
    
    if (products.length > 0) {
      return products[0];
    }
    
    // Return empty product structure if not found
    return {
      identifiers: {
        marketplaceId: marketplaceId || this.config.marketplaceId,
        asin: asin
      },
      marketplaceId: marketplaceId || this.config.marketplaceId,
      asin: asin
    };
  }
  
  /**
   * Get item offers for multiple ASINs (batch operation)
   * Maximum 20 requests per batch
   */
  async getItemOffersBatch(
    requests: Array<{
      asin: string;
      marketplaceId?: string;
      itemCondition?: 'New' | 'Used' | 'Collectible' | 'Refurbished' | 'All';
      customerType?: 'Consumer' | 'Business' | 'All';
    }>
  ): Promise<BatchOffersResponse> {
    await competitivePricingRateLimiter.acquire('getItemOffersBatch');
    
    if (requests.length > 20) {
      throw new Error('Maximum 20 requests per batch');
    }
    
    const batchRequests: ItemOffersRequest[] = requests.map(req => ({
      uri: `/products/pricing/v0/items/${req.asin}/offers`,
      method: 'GET',
      marketplaceId: req.marketplaceId || this.config.marketplaceId,
      itemCondition: req.itemCondition || 'New',
      ...(req.customerType && { customerType: req.customerType }),
      asin: req.asin
    }));
    
    const body = {
      requests: batchRequests
    };
    
    const response = await this.makeRequest(
      'POST',
      '/batches/products/pricing/v0/itemOffers',
      {},
      body
    );
    
    return response;
  }
  
  /**
   * Get lowest priced offers for a single ASIN
   */
  async getLowestPricedOffersForASIN(
    asin: string,
    marketplaceId?: string,
    itemCondition: 'New' | 'Used' | 'Collectible' | 'Refurbished' | 'All' = 'New',
    customerType?: 'Consumer' | 'Business'
  ): Promise<{
    summary: Summary;
    lowestPricedOffers: OfferType[];
  }> {
    const product = await this.getItemOffers(asin, marketplaceId, itemCondition, customerType);
    
    if (!product.summary || !product.offers) {
      return {
        summary: product.summary || { totalOfferCount: 0 },
        lowestPricedOffers: []
      };
    }
    
    // Sort offers by landed price
    const sortedOffers = [...product.offers].sort((a, b) => {
      const priceA = (a.price?.amount || 0) + (a.shippingPrice?.amount || 0);
      const priceB = (b.price?.amount || 0) + (b.shippingPrice?.amount || 0);
      return priceA - priceB;
    });
    
    // Get lowest priced offers (top 5)
    const lowestPricedOffers = sortedOffers.slice(0, 5);
    
    return {
      summary: product.summary,
      lowestPricedOffers
    };
  }
}