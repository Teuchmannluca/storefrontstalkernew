import crypto from 'crypto';
import axios from 'axios';

// Type definitions for Product Pricing API v2022-05-01
export interface CompetitiveSummaryRequest {
  marketplaceId: string;
  asin: string;
  includedData?: string[];
  locale?: string;
}

export interface CompetitiveSummaryBatchRequest {
  uri: string;
  method: 'GET';
  marketplaceId: string;
  includedData?: string[];
  asin?: string;
}

export interface BatchRequest<T> {
  requests: T[];
}

export interface BatchResponse<T> {
  responses: Array<{
    status: {
      statusCode: number;
      reasonPhrase: string;
    };
    headers?: { [key: string]: string };
    request?: T;
    body?: any;
  }>;
}

export interface CompetitiveSummary {
  marketplaceId: string;
  asin: string;
  featuredBuyingOptions?: Array<{
    buyingOptionType: 'NEW' | 'USED';
    price?: {
      listingPrice: MoneyType;
      landedPrice?: MoneyType;
      shippingPrice?: MoneyType;
    };
    deliveryInfo?: {
      isAmazonFulfilled: boolean;
      isFreeShippingEligible: boolean;
      isPrimeEligible: boolean;
    };
  }>;
  numberOfOffers?: Array<{
    condition: string;
    offerCount: number;
  }>;
}

export interface MoneyType {
  currencyCode: string;
  amount: number;
}

// Rate limiter for Product Pricing API v2022-05-01
class PricingRateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;
  
  // Rate limit: 0.5 requests per second (1 request every 2 seconds)
  private readonly minInterval = 2000;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    
    const resolve = this.queue.shift();
    if (resolve) {
      this.lastRequestTime = Date.now();
      resolve();
    }
    
    this.processing = false;
    
    // Process next item in queue
    if (this.queue.length > 0) {
      setTimeout(() => this.process(), 0);
    }
  }
}

const pricingRateLimiter = new PricingRateLimiter();

export class SPAPIPricingClientV2022 {
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
    
    const canonicalRequest = this.createCanonicalRequest(
      method,
      url.pathname,
      queryString,
      signatureHeaders,
      payload
    );
    
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
    
    // Build all headers for the request
    const headers: { [key: string]: string } = {
      ...signatureHeaders,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${date}/${this.credentials.region}/execute-api/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'user-agent': 'StorefrontTracker/1.0'
    };
    
    try {
      console.log(`SP-API Request: ${method} ${url.toString()}`);
      
      const response = await axios({
        method,
        url: url.toString(),
        headers,
        data: body
      });
      
      console.log('SP-API Response Status:', response.status);
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error('API Error:', error.response.status, error.response.data);
        
        // Extract meaningful error message
        const errorData = error.response.data;
        if (errorData && errorData.errors) {
          throw new Error(`SP-API Error: ${errorData.errors[0]?.message || error.response.status}`);
        }
        
        throw new Error(`SP-API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  /**
   * Get competitive summary for multiple ASINs using batch operation
   * Maximum 20 requests per batch
   */
  async getCompetitiveSummaryBatch(
    asins: string[],
    marketplaceId?: string,
    includedData: string[] = ['featuredBuyingOptions']
  ): Promise<BatchResponse<CompetitiveSummaryBatchRequest>> {
    await pricingRateLimiter.acquire();
    
    if (asins.length > 20) {
      throw new Error('Maximum 20 ASINs per batch request');
    }
    
    const marketplace = marketplaceId || this.config.marketplaceId;
    
    const batchRequests: CompetitiveSummaryBatchRequest[] = asins.map(asin => ({
      uri: `/products/pricing/2022-05-01/items/${asin}/competitiveSummary`,
      method: 'GET',
      marketplaceId: marketplace,
      includedData,
      asin
    }));
    
    const body = {
      requests: batchRequests
    };
    
    const response = await this.makeRequest(
      'POST',
      '/batches/products/pricing/2022-05-01/items/competitiveSummary',
      {},
      body
    );
    
    return response;
  }
  
  /**
   * Get competitive summary for a single ASIN
   */
  async getCompetitiveSummary(
    asin: string,
    marketplaceId?: string,
    includedData: string[] = ['featuredBuyingOptions']
  ): Promise<CompetitiveSummary> {
    await pricingRateLimiter.acquire();
    
    const queryParams: any = {
      marketplaceIds: marketplaceId || this.config.marketplaceId,
      includedData: includedData.join(',')
    };
    
    const response = await this.makeRequest(
      'GET',
      `/products/pricing/2022-05-01/items/${asin}/competitiveSummary`,
      queryParams
    );
    
    return response;
  }
  
  /**
   * Extract buy box price from competitive summary
   */
  extractBuyBoxPrice(summary: CompetitiveSummary): {
    price?: number;
    currency?: string;
    hasPrice: boolean;
  } {
    const newOption = summary.featuredBuyingOptions?.find(opt => opt.buyingOptionType === 'NEW');
    
    if (newOption?.price?.listingPrice) {
      return {
        price: newOption.price.listingPrice.amount,
        currency: newOption.price.listingPrice.currencyCode,
        hasPrice: true
      };
    }
    
    return {
      hasPrice: false
    };
  }
}