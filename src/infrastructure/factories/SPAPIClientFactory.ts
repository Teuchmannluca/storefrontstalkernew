import {
  ISPAPIClientFactory,
  SPAPIClientConfig,
  SPAPIRegion,
  ICompetitivePricingClient,
  IFeesClient,
  ICatalogClient
} from './ISPAPIClientFactory';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
import { ILogger } from '../logging/ILogger';
import { LoggerFactory } from '../logging/Logger';

/**
 * Factory for creating SP-API clients with consistent configuration
 */
export class SPAPIClientFactory implements ISPAPIClientFactory {
  private logger: ILogger;
  private defaultConfig: SPAPIClientConfig;

  constructor(defaultConfig?: SPAPIClientConfig) {
    this.logger = LoggerFactory.getLogger('SPAPIClientFactory');
    this.defaultConfig = this.mergeWithEnvironmentConfig(defaultConfig || {});
  }

  createCompetitivePricingClient(config?: SPAPIClientConfig): ICompetitivePricingClient {
    const mergedConfig = this.mergeWithEnvironmentConfig(config || {});
    
    this.logger.info('Creating Competitive Pricing Client', {
      region: mergedConfig.region
    });
    
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const spApiConfig = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };
    
    return new CompetitivePricingClientWrapper(
      new SPAPICompetitivePricingClient(credentials, spApiConfig),
      this.logger.child({ client: 'CompetitivePricing' })
    );
  }

  createFeesClient(config?: SPAPIClientConfig): IFeesClient {
    const mergedConfig = this.mergeWithEnvironmentConfig(config || {});
    
    this.logger.info('Creating Fees Client', {
      region: mergedConfig.region
    });
    
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const spApiConfig = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };
    
    return new FeesClientWrapper(
      new SPAPIProductFeesClient(credentials, spApiConfig),
      this.logger.child({ client: 'Fees' })
    );
  }

  createCatalogClient(config?: SPAPIClientConfig): ICatalogClient {
    const mergedConfig = this.mergeWithEnvironmentConfig(config || {});
    
    this.logger.info('Creating Catalog Client', {
      region: mergedConfig.region
    });
    
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const spApiConfig = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };
    
    return new CatalogClientWrapper(
      new SPAPICatalogClient(credentials, spApiConfig),
      this.logger.child({ client: 'Catalog' })
    );
  }

  private mergeConfigs(...configs: SPAPIClientConfig[]): SPAPIClientConfig {
    return configs.reduce((merged, config) => ({
      ...merged,
      ...config,
      credentials: {
        ...merged.credentials,
        ...config?.credentials
      },
      retryConfig: {
        ...merged.retryConfig,
        ...config?.retryConfig
      }
    }), {});
  }

  private mergeWithEnvironmentConfig(config: SPAPIClientConfig): SPAPIClientConfig {
    return {
      ...config,
      region: config.region || SPAPIRegion.EU,
      credentials: {
        accessKeyId: process.env.AMAZON_ACCESS_KEY_ID,
        secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY,
        refreshToken: process.env.AMAZON_REFRESH_TOKEN,
        ...config.credentials
      },
      retryConfig: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2,
        ...config.retryConfig
      }
    };
  }
}

/**
 * Wrapper classes that add logging and monitoring
 */
class CompetitivePricingClientWrapper implements ICompetitivePricingClient {
  constructor(
    private client: SPAPICompetitivePricingClient,
    private logger: ILogger
  ) {}

  async getCompetitivePricing(asins: string[], marketplaceId: string): Promise<any[]> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Getting competitive pricing', {
        asinCount: asins.length,
        marketplaceId
      });
      
      const result = await this.client.getCompetitivePricing(asins, marketplaceId);
      
      const duration = Date.now() - startTime;
      this.logger.info('Competitive pricing retrieved', {
        asinCount: asins.length,
        resultCount: result.length,
        duration
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to get competitive pricing', error as Error, {
        asinCount: asins.length,
        marketplaceId
      });
      throw error;
    }
  }
}

class FeesClientWrapper implements IFeesClient {
  constructor(
    private client: SPAPIProductFeesClient,
    private logger: ILogger
  ) {}

  async getMyFeesEstimate(
    asin: string,
    price: number,
    currency: string,
    marketplaceId: string
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Getting fees estimate', {
        asin,
        price,
        currency,
        marketplaceId
      });
      
      const result = await this.client.getMyFeesEstimateForASIN(
        asin,
        {
          listingPrice: {
            currencyCode: currency,
            amount: price
          }
        },
        marketplaceId
      );
      
      const duration = Date.now() - startTime;
      this.logger.info('Fees estimate retrieved', {
        asin,
        duration
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to get fees estimate', error as Error, {
        asin,
        price,
        marketplaceId
      });
      throw error;
    }
  }
}

class CatalogClientWrapper implements ICatalogClient {
  constructor(
    private client: SPAPICatalogClient,
    private logger: ILogger
  ) {}

  async getCatalogItem(asin: string, marketplaceId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Getting catalog item', {
        asin,
        marketplaceId
      });
      
      const result = await this.client.getCatalogItem(asin, [marketplaceId]);
      
      const duration = Date.now() - startTime;
      this.logger.info('Catalog item retrieved', {
        asin,
        duration
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to get catalog item', error as Error, {
        asin,
        marketplaceId
      });
      throw error;
    }
  }

  async searchCatalogItems(query: string, marketplaceId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Searching catalog items', {
        query,
        marketplaceId
      });
      
      const result = await this.client.searchCatalogItems({
        keywords: query,
        marketplaceIds: [marketplaceId]
      });
      
      const duration = Date.now() - startTime;
      this.logger.info('Catalog search completed', {
        query,
        resultCount: result?.items?.length || 0,
        duration
      });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to search catalog items', error as Error, {
        query,
        marketplaceId
      });
      throw error;
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const spAPIClientFactory = new SPAPIClientFactory();