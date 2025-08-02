export interface ICacheService {
  /**
   * Get a value from cache
   */
  get<T>(key: string): Promise<T | null>;
  
  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  
  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<void>;
  
  /**
   * Delete multiple keys matching a pattern
   */
  deletePattern(pattern: string): Promise<void>;
  
  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>;
  
  /**
   * Get remaining TTL for a key
   */
  ttl(key: string): Promise<number>;
  
  /**
   * Wrap a function with caching
   */
  wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T>;
  
  /**
   * Clear all cache
   */
  clear(): Promise<void>;
}

export interface CacheConfig {
  defaultTTL: number; // seconds
  keyPrefix?: string;
  maxKeys?: number;
}

/**
 * Cache key builder for consistent key generation
 */
export class CacheKeyBuilder {
  constructor(private prefix: string) {}
  
  product(asin: string): string {
    return `${this.prefix}:product:${asin}`;
  }
  
  productBatch(asins: string[]): string {
    return `${this.prefix}:products:${asins.sort().join(',')}`;
  }
  
  storefrontProducts(storefrontId: string): string {
    return `${this.prefix}:storefront:${storefrontId}:products`;
  }
  
  pricing(asin: string, marketplaceId: string): string {
    return `${this.prefix}:pricing:${marketplaceId}:${asin}`;
  }
  
  fees(asin: string, price: number, marketplaceId: string): string {
    return `${this.prefix}:fees:${marketplaceId}:${asin}:${price}`;
  }
  
  scan(scanId: string): string {
    return `${this.prefix}:scan:${scanId}`;
  }
  
  userScans(userId: string): string {
    return `${this.prefix}:user:${userId}:scans`;
  }
}