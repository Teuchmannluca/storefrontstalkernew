import { ICacheService, CacheConfig } from './ICacheService';

/**
 * Redis-based cache implementation
 */
export class RedisCacheService implements ICacheService {
  private keyPrefix: string;
  private defaultTTL: number;

  constructor(
    private redisClient: any, // Use proper Redis client type in production
    config: CacheConfig
  ) {
    this.keyPrefix = config.keyPrefix || 'cache';
    this.defaultTTL = config.defaultTTL;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redisClient.get(fullKey);
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      const serialized = JSON.stringify(value);
      const ttl = ttlSeconds || this.defaultTTL;
      
      if (ttl > 0) {
        await this.redisClient.set(fullKey, serialized, 'EX', ttl);
      } else {
        await this.redisClient.set(fullKey, serialized);
      }
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      // Don't throw - caching errors shouldn't break the application
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.redisClient.del(fullKey);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const fullPattern = this.buildKey(pattern);
      const keys = await this.redisClient.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const exists = await this.redisClient.exists(fullKey);
      return exists === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.buildKey(key);
      const ttl = await this.redisClient.ttl(fullKey);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      console.error(`Cache ttl error for key ${key}:`, error);
      return 0;
    }
  }

  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttlSeconds);
    
    return result;
  }

  async clear(): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }
}

/**
 * In-memory cache implementation for development
 */
export class InMemoryCacheService implements ICacheService {
  private cache: Map<string, { value: any; expires?: number }> = new Map();
  private defaultTTL: number;

  constructor(config: CacheConfig) {
    this.defaultTTL = config.defaultTTL;
    
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (entry.expires && entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.defaultTTL;
    const entry = {
      value,
      expires: ttl > 0 ? Date.now() + (ttl * 1000) : undefined
    };
    
    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key);
    
    if (!entry || !entry.expires) {
      return 0;
    }
    
    const remaining = Math.floor((entry.expires - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const result = await fn();
    await this.set(key, result, ttlSeconds);
    
    return result;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires && entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }
}