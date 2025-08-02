import { IDistributedRateLimiter, RateLimitConfig } from './IDistributedRateLimiter';

/**
 * Redis-based distributed rate limiter using token bucket algorithm
 * This ensures rate limits are respected across all instances
 */
export class RedisRateLimiter implements IDistributedRateLimiter {
  private configs: Map<string, RateLimitConfig> = new Map();
  
  constructor(
    private redisClient: any, // In production, use proper Redis client type
    configs: RateLimitConfig[]
  ) {
    configs.forEach(config => {
      this.configs.set(config.endpoint, config);
    });
  }

  async waitForTokens(endpoint: string, tokensRequested: number): Promise<void> {
    const config = this.configs.get(endpoint);
    if (!config) {
      throw new Error(`No rate limit config for endpoint: ${endpoint}`);
    }

    let attempts = 0;
    const maxAttempts = 60; // Max wait of ~60 seconds
    
    while (attempts < maxAttempts) {
      const hasTokens = await this.consumeTokens(endpoint, tokensRequested);
      if (hasTokens) {
        return;
      }
      
      // Calculate wait time based on refill rate
      const waitTime = Math.min(
        (tokensRequested / config.refillRate) * 1000,
        1000 // Max 1 second per attempt
      );
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      attempts++;
    }
    
    throw new Error(`Rate limit timeout for endpoint: ${endpoint}`);
  }

  async hasTokens(endpoint: string, tokensRequested: number): Promise<boolean> {
    const tokens = await this.getTokenCount(endpoint);
    return tokens >= tokensRequested;
  }

  async consumeTokens(endpoint: string, tokens: number): Promise<boolean> {
    const config = this.configs.get(endpoint);
    if (!config) {
      throw new Error(`No rate limit config for endpoint: ${endpoint}`);
    }

    const key = `rate_limit:${endpoint}`;
    const now = Date.now();
    
    // Lua script for atomic token bucket operation
    const luaScript = `
      local key = KEYS[1]
      local max_tokens = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local tokens_requested = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('HGETALL', key)
      local current_tokens = max_tokens
      local last_refill = now
      
      if #bucket > 0 then
        for i = 1, #bucket, 2 do
          if bucket[i] == 'tokens' then
            current_tokens = tonumber(bucket[i + 1])
          elseif bucket[i] == 'last_refill' then
            last_refill = tonumber(bucket[i + 1])
          end
        end
      end
      
      -- Calculate tokens to add based on time passed
      local time_passed = (now - last_refill) / 1000
      local tokens_to_add = time_passed * refill_rate
      current_tokens = math.min(max_tokens, current_tokens + tokens_to_add)
      
      -- Check if we have enough tokens
      if current_tokens >= tokens_requested then
        current_tokens = current_tokens - tokens_requested
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600) -- Expire after 1 hour of inactivity
        return 1
      else
        -- Update refill time even if we can't consume
        redis.call('HSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600)
        return 0
      end
    `;

    try {
      const result = await this.redisClient.eval(
        luaScript,
        1,
        key,
        config.maxTokens,
        config.refillRate,
        tokens,
        now
      );
      
      return result === 1;
    } catch (error) {
      console.error('Redis rate limiter error:', error);
      // Fallback to allowing the request in case of Redis errors
      return true;
    }
  }

  async getTokenCount(endpoint: string): Promise<number> {
    const config = this.configs.get(endpoint);
    if (!config) {
      return 0;
    }

    const key = `rate_limit:${endpoint}`;
    
    try {
      const data = await this.redisClient.hgetall(key);
      
      if (!data || !data.tokens) {
        return config.maxTokens;
      }
      
      const currentTokens = parseFloat(data.tokens);
      const lastRefill = parseFloat(data.last_refill);
      const now = Date.now();
      
      // Calculate tokens based on time passed
      const timePassed = (now - lastRefill) / 1000;
      const tokensToAdd = timePassed * config.refillRate;
      
      return Math.min(config.maxTokens, currentTokens + tokensToAdd);
    } catch (error) {
      console.error('Redis get token count error:', error);
      return config.maxTokens;
    }
  }
}

/**
 * In-memory fallback rate limiter for development/testing
 */
export class InMemoryRateLimiter implements IDistributedRateLimiter {
  private buckets: Map<string, {
    tokens: number;
    lastRefill: number;
  }> = new Map();
  
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor(configs: RateLimitConfig[]) {
    configs.forEach(config => {
      this.configs.set(config.endpoint, config);
      this.buckets.set(config.endpoint, {
        tokens: config.maxTokens,
        lastRefill: Date.now()
      });
    });
  }

  async waitForTokens(endpoint: string, tokensRequested: number): Promise<void> {
    const config = this.configs.get(endpoint);
    if (!config) {
      throw new Error(`No rate limit config for endpoint: ${endpoint}`);
    }

    while (!(await this.consumeTokens(endpoint, tokensRequested))) {
      const waitTime = Math.min(
        (tokensRequested / config.refillRate) * 1000,
        1000
      );
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  async hasTokens(endpoint: string, tokensRequested: number): Promise<boolean> {
    const tokens = await this.getTokenCount(endpoint);
    return tokens >= tokensRequested;
  }

  async consumeTokens(endpoint: string, tokens: number): Promise<boolean> {
    const config = this.configs.get(endpoint);
    const bucket = this.buckets.get(endpoint);
    
    if (!config || !bucket) {
      return false;
    }

    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * config.refillRate;
    
    bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  async getTokenCount(endpoint: string): Promise<number> {
    const config = this.configs.get(endpoint);
    const bucket = this.buckets.get(endpoint);
    
    if (!config || !bucket) {
      return 0;
    }

    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = timePassed * config.refillRate;
    
    return Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
  }
}