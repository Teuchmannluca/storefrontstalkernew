import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { catalogAPIRateLimiter } from './sp-api-rate-limiter';

interface SPAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  region?: string;
  sandbox?: boolean;
}

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

interface CatalogItem {
  asin: string;
  attributes?: any;
  identifiers?: Array<{
    marketplaceId: string;
    identifiers: Array<{
      identifier: string;
      identifierType: string;
    }>;
  }>;
  images?: Array<{
    marketplaceId: string;
    images: Array<{
      variant: string;
      link: string;
      height: number;
      width: number;
    }>;
  }>;
  productTypes?: Array<{
    marketplaceId: string;
    productType: string;
  }>;
  salesRanks?: Array<{
    marketplaceId: string;
    ranks: Array<{
      title: string;
      rank: number;
      link?: string;
    }>;
  }>;
  summaries?: Array<{
    marketplaceId: string;
    brandName?: string;
    browseNode?: string;
    colorName?: string;
    itemName?: string;
    manufacturer?: string;
    modelNumber?: string;
    sizeName?: string;
    styleName?: string;
  }>;
  dimensions?: Array<{
    marketplaceId: string;
    item?: {
      height?: { value: number; unit: string };
      length?: { value: number; unit: string };
      weight?: { value: number; unit: string };
      width?: { value: number; unit: string };
    };
    package?: {
      height?: { value: number; unit: string };
      length?: { value: number; unit: string };
      weight?: { value: number; unit: string };
      width?: { value: number; unit: string };
    };
  }>;
}

interface SearchCatalogItemsParams {
  keywords?: string;
  marketplaceIds: string[];
  includedData?: string[];
  brandNames?: string[];
  classificationIds?: string[];
  pageSize?: number;
  pageToken?: string;
  keywordsLocale?: string;
  locale?: string;
}

interface SearchCatalogItemsResponse {
  numberOfResults: number;
  pagination: {
    nextToken?: string;
  };
  refinements: {
    brands: Array<{ numberOfResults: number; brandName: string }>;
    classifications: Array<{ numberOfResults: number; displayName: string; classificationId: string }>;
  };
  items: CatalogItem[];
}

export class SPAPICatalogClient {
  private accessToken: string = '';
  private tokenExpiry: Date = new Date();
  private config: SPAPIConfig;
  private awsCredentials: AWSCredentials;
  private axiosInstance: AxiosInstance;

  constructor(awsCredentials: AWSCredentials, config: SPAPIConfig) {
    this.awsCredentials = awsCredentials;
    this.config = config;
    
    const baseURL = config.sandbox 
      ? `https://sandbox.sellingpartnerapi-${config.region || 'eu'}.amazon.com`
      : `https://sellingpartnerapi-${config.region || 'eu'}.amazon.com`;
    
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
    });
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.post('https://api.amazon.com/auth/o2/token', {
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in * 1000));
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken || new Date() >= this.tokenExpiry) {
      await this.refreshAccessToken();
    }
  }

  private signRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    queryParams?: Record<string, any>
  ): Record<string, string> {
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.substr(0, 8);
    
    // Create canonical request
    const canonicalQueryString = queryParams
      ? Object.entries(queryParams)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]: any) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    
    const canonicalHeaders = Object.entries({
      ...headers,
      'host': this.axiosInstance.defaults.baseURL!.replace(/^https?:\/\//, ''),
      'x-amz-date': datetime,
    })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]: any) => `${k.toLowerCase()}:${v}`)
      .join('\n');
    
    const signedHeaders = Object.keys({
      ...headers,
      'host': true,
      'x-amz-date': true,
    })
      .map((k: any) => k.toLowerCase())
      .sort()
      .join(';');
    
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');
    
    const canonicalRequest = [
      method,
      path,
      canonicalQueryString,
      canonicalHeaders + '\n',
      signedHeaders,
      payloadHash,
    ].join('\n');
    
    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${date}/${this.awsCredentials.region}/execute-api/aws4_request`;
    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');
    
    const stringToSign = [
      algorithm,
      datetime,
      credentialScope,
      hashedCanonicalRequest,
    ].join('\n');
    
    // Calculate signature
    const kDate = crypto
      .createHmac('sha256', `AWS4${this.awsCredentials.secretAccessKey}`)
      .update(date)
      .digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(this.awsCredentials.region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update('execute-api').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');
    
    // Create authorization header
    const authorizationHeader = [
      `${algorithm} Credential=${this.awsCredentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');
    
    return {
      ...headers,
      'Authorization': authorizationHeader,
      'x-amz-date': datetime,
      'x-amz-security-token': this.awsCredentials.sessionToken || '',
    };
  }

  async searchCatalogItems(params: SearchCatalogItemsParams): Promise<SearchCatalogItemsResponse> {
    // Apply rate limiting
    await catalogAPIRateLimiter.acquire();
    
    await this.ensureValidToken();
    
    const path = '/catalog/2022-04-01/items';
    const headers = {
      'x-amz-access-token': this.accessToken,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    
    const queryParams: Record<string, any> = {
      marketplaceIds: params.marketplaceIds.join(','),
    };
    
    if (params.keywords) queryParams.keywords = params.keywords;
    if (params.includedData) queryParams.includedData = params.includedData.join(',');
    if (params.brandNames) queryParams.brandNames = params.brandNames.join(',');
    if (params.classificationIds) queryParams.classificationIds = params.classificationIds.join(',');
    if (params.pageSize) queryParams.pageSize = params.pageSize;
    if (params.pageToken) queryParams.pageToken = params.pageToken;
    if (params.keywordsLocale) queryParams.keywordsLocale = params.keywordsLocale;
    if (params.locale) queryParams.locale = params.locale;
    
    const signedHeaders = this.signRequest('GET', path, headers, queryParams);
    
    try {
      const response = await this.axiosInstance.get(path, {
        headers: signedHeaders,
        params: queryParams,
      });
      
      return response.data;
    } catch (error: any) {
      console.error('Error searching catalog items:', error.response?.data || error);
      throw new Error(`Failed to search catalog items: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getCatalogItem(asin: string, marketplaceIds: string[], includedData?: string[]): Promise<CatalogItem> {
    // Apply rate limiting
    await catalogAPIRateLimiter.acquire();
    
    await this.ensureValidToken();
    
    const path = `/catalog/2022-04-01/items/${asin}`;
    const headers = {
      'x-amz-access-token': this.accessToken,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    
    const queryParams: Record<string, any> = {
      marketplaceIds: marketplaceIds.join(','),
    };
    
    if (includedData) {
      queryParams.includedData = includedData.join(',');
    }
    
    const signedHeaders = this.signRequest('GET', path, headers, queryParams);
    
    try {
      const response = await this.axiosInstance.get(path, {
        headers: signedHeaders,
        params: queryParams,
      });
      
      return response.data;
    } catch (error: any) {
      console.error('Error getting catalog item:', error.response?.data || error);
      throw new Error(`Failed to get catalog item: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
  }

  async getItemBySellerSKU(sellerSKU: string, marketplaceIds: string[], includedData?: string[]): Promise<CatalogItem> {
    // First search for the item by SKU
    const searchResult = await this.searchCatalogItems({
      keywords: sellerSKU,
      marketplaceIds,
      includedData,
      pageSize: 1
    });
    
    if (searchResult.items.length === 0) {
      throw new Error(`No items found for SKU: ${sellerSKU}`);
    }
    
    return searchResult.items[0];
  }
}

export default SPAPICatalogClient;