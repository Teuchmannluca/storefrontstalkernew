export interface ISPAPIClientFactory {
  /**
   * Create a competitive pricing client
   */
  createCompetitivePricingClient(config?: SPAPIClientConfig): ICompetitivePricingClient;
  
  /**
   * Create a fees estimation client
   */
  createFeesClient(config?: SPAPIClientConfig): IFeesClient;
  
  /**
   * Create a catalog items client
   */
  createCatalogClient(config?: SPAPIClientConfig): ICatalogClient;
}

export interface SPAPIClientConfig {
  region?: SPAPIRegion;
  credentials?: SPAPICredentials;
  rateLimiter?: any;
  retryConfig?: RetryConfig;
}

export interface SPAPICredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface RetryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export enum SPAPIRegion {
  NA = 'na',
  EU = 'eu',
  FE = 'fe'
}

// Client interfaces
export interface ICompetitivePricingClient {
  getCompetitivePricing(asins: string[], marketplaceId: string): Promise<any[]>;
}

export interface IFeesClient {
  getMyFeesEstimate(
    asin: string,
    price: number,
    currency: string,
    marketplaceId: string
  ): Promise<any>;
}

export interface ICatalogClient {
  getCatalogItem(asin: string, marketplaceId: string): Promise<any>;
  searchCatalogItems(query: string, marketplaceId: string): Promise<any>;
}