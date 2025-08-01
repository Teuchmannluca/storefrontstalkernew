interface RateLimiterOptions {
  requestsPerSecond: number;
  burstCapacity?: number;
}

interface QueueItem {
  resolve: (value: void) => void;
  reject: (reason?: any) => void;
}

export class SPAPIRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private queue: QueueItem[] = [];
  private processing = false;

  constructor(options: RateLimiterOptions) {
    // SP-API rate limits for Catalog API:
    // - 2 requests per second sustained rate
    // - 6 requests burst capacity
    this.refillRate = options.requestsPerSecond;
    this.maxTokens = options.burstCapacity || options.requestsPerSecond * 3;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      this.refillTokens();

      if (this.tokens >= 1) {
        const item = this.queue.shift()!;
        this.tokens -= 1;
        item.resolve();
      } else {
        // Wait for tokens to refill
        const waitTime = (1 - this.tokens) / this.refillRate * 1000;
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 100)));
      }
    }

    this.processing = false;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}

// Create singleton instances for different SP-API operations
export const catalogAPIRateLimiter = new SPAPIRateLimiter({
  requestsPerSecond: 2,
  burstCapacity: 6
});

export const ordersAPIRateLimiter = new SPAPIRateLimiter({
  requestsPerSecond: 10,
  burstCapacity: 30
});

export const reportsAPIRateLimiter = new SPAPIRateLimiter({
  requestsPerSecond: 0.0167, // 1 per minute
  burstCapacity: 1
});