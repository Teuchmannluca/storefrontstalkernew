interface RateLimiterOptions {
  tokensPerMinute: number;
  maxBurst?: number;
}

export class KeepaRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  private queue: Array<{
    resolve: (value: void) => void;
    reject: (reason?: any) => void;
    tokens: number;
  }> = [];
  private processing = false;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxBurst || options.tokensPerMinute;
    this.tokens = this.maxTokens;
    this.refillRate = options.tokensPerMinute / 60; // tokens per second
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const secondsPassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = secondsPassed * this.refillRate;
    
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

      const next = this.queue[0];
      if (this.tokens >= next.tokens) {
        this.queue.shift();
        this.tokens -= next.tokens;
        next.resolve();
      } else {
        // Calculate wait time
        const tokensNeeded = next.tokens - this.tokens;
        const waitTime = (tokensNeeded / this.refillRate) * 1000;
        
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
      }
    }

    this.processing = false;
  }

  async consume(tokens: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, tokens });
      this.processQueue();
    });
  }

  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}