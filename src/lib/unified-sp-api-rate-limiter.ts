/**
 * Unified SP-API Rate Limiter
 * 
 * Centralised rate limiting service for all Amazon SP-API operations.
 * Implements token bucket algorithm with proper request queuing and retry logic.
 * 
 * Based on Amazon SP-API official rate limits (2025):
 * - getCompetitivePricing: 0.5 req/sec, burst: 1
 * - getCatalogItem: 2 req/sec, burst: 2  
 * - getMyFeesEstimateForASIN: 1 req/sec, burst: 2
 * - getMyFeesEstimates: 0.5 req/sec, burst: 1
 */

interface RateLimitConfig {
  /** Requests per second allowed */
  rate: number
  /** Burst capacity (max requests at once) */
  burst: number
  /** Minimum delay between requests in milliseconds */
  minDelay: number
  /** Maximum items per request (for batch operations) */
  maxItems?: number
}

interface QueuedRequest {
  operation: string
  resolve: (value: void | PromiseLike<void>) => void
  reject: (reason?: any) => void
  timestamp: number
  retryCount: number
}

interface RateLimitState {
  tokens: number
  lastRefill: number
  lastRequest: number
  queue: QueuedRequest[]
  processing: boolean
}

export class UnifiedSPAPIRateLimiter {
  private static instance: UnifiedSPAPIRateLimiter
  
  private limits: Record<string, RateLimitConfig> = {
    // Product Pricing API v0
    getCompetitivePricing: {
      rate: 0.5,      // 1 request every 2 seconds
      burst: 1,       // Max 1 request at once
      minDelay: 2000, // 2 seconds minimum between requests
      maxItems: 20    // 20 ASINs per batch
    },
    
    getItemOffers: {
      rate: 0.5,      // 1 request every 2 seconds
      burst: 1,       // Max 1 request at once
      minDelay: 2000, // 2 seconds minimum between requests
      maxItems: 1     // 1 ASIN per request
    },
    
    getItemOffersBatch: {
      rate: 0.1,      // 1 request every 10 seconds
      burst: 1,       // Max 1 request at once
      minDelay: 10000, // 10 seconds minimum between requests
      maxItems: 20    // 20 requests per batch
    },
    
    // Catalog Items API v2022-04-01
    getCatalogItem: {
      rate: 2,        // 2 requests per second
      burst: 2,       // Max 2 requests at once
      minDelay: 500,  // 500ms minimum between requests
      maxItems: 1     // 1 ASIN per request
    },
    
    searchCatalogItems: {
      rate: 2,        // 2 requests per second
      burst: 2,       // Max 2 requests at once
      minDelay: 500,  // 500ms minimum between requests
      maxItems: 20    // 20 ASINs per search
    },
    
    // Product Fees API v0
    getMyFeesEstimateForASIN: {
      rate: 1,        // 1 request per second
      burst: 2,       // Max 2 requests at once
      minDelay: 1000, // 1 second minimum between requests
      maxItems: 1     // 1 ASIN per request
    },
    
    getMyFeesEstimates: {
      rate: 0.5,      // 1 request every 2 seconds
      burst: 1,       // Max 1 request at once
      minDelay: 2000, // 2 seconds minimum between requests
      maxItems: 20    // 20 products per batch
    }
  }
  
  private state: Record<string, RateLimitState> = {}
  
  private constructor() {
    // Initialise state for each operation
    Object.keys(this.limits).forEach(operation => {
      const config = this.limits[operation]
      this.state[operation] = {
        tokens: config.burst,
        lastRefill: Date.now(),
        lastRequest: 0,
        queue: [],
        processing: false
      }
    })
    
    // Start the token refill process
    this.startTokenRefill()
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): UnifiedSPAPIRateLimiter {
    if (!this.instance) {
      this.instance = new UnifiedSPAPIRateLimiter()
    }
    return this.instance
  }
  
  /**
   * Acquire permission to make an API request
   * Will queue the request if rate limits are exceeded
   */
  async acquire(operation: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.limits[operation]) {
        reject(new Error(`Unknown SP-API operation: ${operation}`))
        return
      }
      
      const state = this.state[operation]
      const config = this.limits[operation]
      
      // Add to queue
      const queuedRequest: QueuedRequest = {
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0
      }
      
      state.queue.push(queuedRequest)
      
      // Process queue if not already processing
      if (!state.processing) {
        this.processQueue(operation)
      }
    })
  }
  
  /**
   * Process queued requests for an operation
   */
  private async processQueue(operation: string): Promise<void> {
    const state = this.state[operation]
    const config = this.limits[operation]
    
    state.processing = true
    
    while (state.queue.length > 0) {
      const request = state.queue[0]
      
      // Check if we have tokens
      if (state.tokens <= 0) {
        // Wait for token refill
        await this.waitForToken(operation)
        continue
      }
      
      // Check minimum delay
      const now = Date.now()
      const timeSinceLastRequest = now - state.lastRequest
      if (timeSinceLastRequest < config.minDelay) {
        const waitTime = config.minDelay - timeSinceLastRequest
        await this.sleep(waitTime)
      }
      
      // Consume token and process request
      state.tokens--
      state.lastRequest = Date.now()
      
      // Remove from queue and resolve
      state.queue.shift()
      request.resolve()
      
      // Add jitter to prevent thundering herd
      if (state.queue.length > 0) {
        await this.sleep(50 + Math.random() * 100) // 50-150ms jitter
      }
    }
    
    state.processing = false
  }
  
  /**
   * Wait for tokens to be refilled
   */
  private async waitForToken(operation: string): Promise<void> {
    const config = this.limits[operation]
    const refillTime = 1000 / config.rate // Time to get one token
    await this.sleep(refillTime)
  }
  
  /**
   * Start token refill timer
   */
  private startTokenRefill(): void {
    setInterval(() => {
      const now = Date.now()
      
      Object.keys(this.limits).forEach(operation => {
        const config = this.limits[operation]
        const state = this.state[operation]
        
        const timeSinceLastRefill = now - state.lastRefill
        const tokensToAdd = Math.floor((timeSinceLastRefill / 1000) * config.rate)
        
        if (tokensToAdd > 0) {
          state.tokens = Math.min(config.burst, state.tokens + tokensToAdd)
          state.lastRefill = now
        }
      })
    }, 100) // Check every 100ms
  }
  
  /**
   * Get current status of rate limiter
   */
  getStatus(): Record<string, {
    tokensAvailable: number
    queueLength: number
    lastRequest: number
    nextAvailable: number
    dailyRequests?: number
  }> {
    const status: Record<string, any> = {}
    
    Object.keys(this.limits).forEach(operation => {
      const config = this.limits[operation]
      const state = this.state[operation]
      const now = Date.now()
      
      const nextTokenTime = state.lastRefill + (1000 / config.rate)
      const nextRequestTime = state.lastRequest + config.minDelay
      
      status[operation] = {
        tokensAvailable: state.tokens,
        queueLength: state.queue.length,
        lastRequest: state.lastRequest,
        nextAvailable: Math.max(nextTokenTime, nextRequestTime)
      }
    })
    
    return status
  }
  
  /**
   * Add retry logic for 429 errors
   */
  async withRetry<T>(
    operation: string, 
    apiCall: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wait for rate limiter
        await this.acquire(operation)
        
        // Make the API call
        return await apiCall()
        
      } catch (error: any) {
        lastError = error
        
        // Check if it's a rate limit error
        if (this.isRateLimitError(error) && attempt < maxRetries) {
          const backoffTime = this.calculateBackoff(attempt)
          console.log(`Rate limit hit for ${operation}, backing off ${backoffTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
          await this.sleep(backoffTime)
          continue
        }
        
        // Re-throw if not a rate limit error or max retries exceeded
        throw error
      }
    }
    
    throw lastError!
  }
  
  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return (
      error?.response?.status === 429 ||
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.includes('TooManyRequests') ||
      error?.message?.includes('QuotaExceeded') ||
      error?.message?.toLowerCase().includes('rate limit')
    )
  }
  
  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = 2000 // 2 seconds
    const maxDelay = 32000 // 32 seconds max
    const exponentialDelay = baseDelay * Math.pow(2, attempt)
    const jitter = Math.random() * 1000 // 0-1 second jitter
    
    return Math.min(maxDelay, exponentialDelay + jitter)
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * Get recommended batch size for an operation
   */
  getBatchSize(operation: string): number {
    return this.limits[operation]?.maxItems || 1
  }
  
  /**
   * Reset rate limiter (for testing)
   */
  reset(): void {
    Object.keys(this.limits).forEach(operation => {
      const config = this.limits[operation]
      this.state[operation] = {
        tokens: config.burst,
        lastRefill: Date.now(),
        lastRequest: 0,
        queue: [],
        processing: false
      }
    })
  }
}