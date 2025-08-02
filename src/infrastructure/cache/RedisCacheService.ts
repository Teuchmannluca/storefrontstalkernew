import { injectable } from 'tsyringe';
import Redis from 'ioredis';
import { ICacheService } from '@/domain/interfaces/ICacheService';

@injectable()
export class RedisCacheService implements ICacheService {
  private redis: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: false,
    });

    this.redis.on('error', (error) => {
      console.error('[Redis] Connection error:', error);
    });

    this.redis.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      
      return JSON.parse(value);
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      console.error(`[Redis] Error setting key ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error('[Redis] Error clearing cache:', error);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error(`[Redis] Error checking key ${key}:`, error);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      console.error('[Redis] Error in mget:', error);
      return keys.map(() => null);
    }
  }

  async mset<T>(items: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const { key, value, ttl } of items) {
        const serialized = JSON.stringify(value);
        if (ttl && ttl > 0) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('[Redis] Error in mset:', error);
      throw error;
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error(`[Redis] Error invalidating pattern ${pattern}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}