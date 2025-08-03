import { injectable } from 'tsyringe';
import { SPAPIQuotaManager } from './QuotaManager';

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstCapacity: number;
  maxRetries: number;
  initialRetryDelay: number;
  maxRetryDelay: number;
  backoffMultiplier: number;
}

@injectable()
export class EnhancedSPAPIRateLimiter {
  private queues = new Map<string, QueueItem[]>();
  private processing = new Map<string, boolean>();
  private tokens = new Map<string, TokenBucket>();
  private retryDelays = new Map<string, number>();
  
  private configs: Map<string, RateLimitConfig> = new Map([
    ['getCompetitivePricing', {
      requestsPerSecond: 0.2,  // Very conservative: 1 per 5 seconds
      burstCapacity: 1,
      maxRetries: 5,
      initialRetryDelay: 5000,
      maxRetryDelay: 300000,  // 5 minutes
      backoffMultiplier: 2
    }],
    ['getItemOffers', {
      requestsPerSecond: 5,
      burstCapacity: 10,
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 60000,
      backoffMultiplier: 2
    }],
    ['getCatalogItem', {
      requestsPerSecond: 2,
      burstCapacity: 2,
      maxRetries: 3,
      initialRetryDelay: 2000,
      maxRetryDelay: 60000,
      backoffMultiplier: 2
    }],
    ['getMyFeesEstimate', {
      requestsPerSecond: 1,
      burstCapacity: 2,
      maxRetries: 3,
      initialRetryDelay: 2000,
      maxRetryDelay: 60000,
      backoffMultiplier: 2
    }]
  ]);

  constructor(private quotaManager: SPAPIQuotaManager) {
    // Initialize token buckets
    for (const [operation, config] of this.configs.entries()) {
      this.tokens.set(operation, {
        tokens: config.burstCapacity,
        lastRefill: Date.now()
      });
    }
  }

  async acquire(operation: string): Promise<void> {
    // First check quota
    const quotaStatus = await this.quotaManager.checkQuota(operation);
    if (!quotaStatus.available) {
      await this.quotaManager.waitForQuota(operation);
    }

    return new Promise((resolve, reject) => {
      if (!this.queues.has(operation)) {
        this.queues.set(operation, []);
        this.processing.set(operation, false);
      }

      const queue = this.queues.get(operation)!;
      queue.push({ resolve, reject, timestamp: Date.now() });

      this.process(operation);
    });
  }

  private async process(operation: string): Promise<void> {
    if (this.processing.get(operation)) return;
    
    const queue = this.queues.get(operation);
    if (!queue || queue.length === 0) return;

    this.processing.set(operation, true);

    try {
      const config = this.configs.get(operation);
      if (!config) {
        // Unknown operation, process immediately
        const item = queue.shift()!;
        item.resolve();
        return;
      }

      // Refill tokens
      this.refillTokens(operation);

      const bucket = this.tokens.get(operation)!;
      
      if (bucket.tokens >= 1) {
        // We have tokens, process the request
        bucket.tokens--;
        const item = queue.shift()!;
        
        // Record the request
        this.quotaManager.recordRequest(operation);
        
        // Reset retry delay on success
        this.retryDelays.delete(operation);
        
        item.resolve();
      } else {
        // No tokens available, wait for refill
        const waitTime = Math.ceil(1000 / config.requestsPerSecond);
        setTimeout(() => this.process(operation), waitTime);
      }
    } finally {
      this.processing.set(operation, false);
      
      // Process next item if queue is not empty
      if (queue && queue.length > 0) {
        setImmediate(() => this.process(operation));
      }
    }
  }

  private refillTokens(operation: string): void {
    const config = this.configs.get(operation)!;
    const bucket = this.tokens.get(operation)!;
    
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000; // in seconds
    const tokensToAdd = timePassed * config.requestsPerSecond;
    
    bucket.tokens = Math.min(
      config.burstCapacity,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefill = now;
  }

  handleQuotaExceeded(operation: string, retryAfter?: number): void {
    // Record quota exceeded in quota manager
    this.quotaManager.recordQuotaExceeded(operation, retryAfter);
    
    // Calculate exponential backoff
    const config = this.configs.get(operation);
    if (!config) return;
    
    let currentDelay = this.retryDelays.get(operation) || config.initialRetryDelay;
    currentDelay = Math.min(currentDelay * config.backoffMultiplier, config.maxRetryDelay);
    this.retryDelays.set(operation, currentDelay);
    
    // Clear the queue and reject all pending requests
    const queue = this.queues.get(operation);
    if (queue) {
      queue.forEach(item => {
        item.reject(new Error(`Quota exceeded for ${operation}. Retry after ${currentDelay}ms`));
      });
      queue.length = 0;
    }
  }

  async executeWithRetry<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const config = this.configs.get(operation) || {
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 60000,
      backoffMultiplier: 2
    };

    let lastError: any;
    let retryDelay = config.initialRetryDelay;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        await this.acquire(operation);
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a quota exceeded error
        if (error.message?.includes('QuotaExceeded') || 
            error.message?.includes('You exceeded your quota')) {
          
          // Extract retry-after header if available
          const retryAfter = error.response?.headers?.['retry-after'];
          this.handleQuotaExceeded(operation, retryAfter ? parseInt(retryAfter) : undefined);
          
          // Wait for quota to reset
          await this.quotaManager.waitForQuota(operation);
          
          // Reset retry delay after quota wait
          retryDelay = config.initialRetryDelay;
        } else if (error.response?.status === 429) {
          // Rate limit error (not quota)
          console.log(`[RateLimiter] Rate limit hit for ${operation}, attempt ${attempt}/${config.maxRetries}`);
          
          if (attempt < config.maxRetries) {
            console.log(`[RateLimiter] Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(retryDelay * config.backoffMultiplier, config.maxRetryDelay);
          }
        } else {
          // Non-retryable error
          throw error;
        }
      }
    }

    throw lastError;
  }

  getStatus(): any {
    const status: any = {};
    
    for (const [operation, config] of this.configs.entries()) {
      const bucket = this.tokens.get(operation)!;
      const queue = this.queues.get(operation) || [];
      
      status[operation] = {
        config,
        tokens: bucket.tokens,
        queueLength: queue.length,
        retryDelay: this.retryDelays.get(operation) || 0
      };
    }
    
    return status;
  }
}

interface QueueItem {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}