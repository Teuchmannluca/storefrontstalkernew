export class OpenAIRateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly maxRequestsPerHour: number;
  private readonly maxRequestsPerDay: number;
  
  constructor(
    maxPerMinute = 20,    // GPT-3.5-turbo default limit
    maxPerHour = 1000,    // Conservative hourly limit
    maxPerDay = 10000     // Daily limit
  ) {
    this.maxRequestsPerMinute = maxPerMinute;
    this.maxRequestsPerHour = maxPerHour;
    this.maxRequestsPerDay = maxPerDay;
  }
  
  /**
   * Check if we can make a request now
   */
  canMakeRequest(): boolean {
    const now = Date.now();
    this.cleanupOldRequests(now);
    
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const requestsLastMinute = this.requests.filter(time => time > oneMinuteAgo).length;
    const requestsLastHour = this.requests.filter(time => time > oneHourAgo).length;
    const requestsLastDay = this.requests.filter(time => time > oneDayAgo).length;
    
    return (
      requestsLastMinute < this.maxRequestsPerMinute &&
      requestsLastHour < this.maxRequestsPerHour &&
      requestsLastDay < this.maxRequestsPerDay
    );
  }
  
  /**
   * Record a new request
   */
  recordRequest(): void {
    this.requests.push(Date.now());
    this.cleanupOldRequests();
  }
  
  /**
   * Get time until next request is allowed (in milliseconds)
   */
  getTimeUntilNextRequest(): number {
    if (this.canMakeRequest()) {
      return 0;
    }
    
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const requestsLastMinute = this.requests.filter(time => time > oneMinuteAgo);
    
    if (requestsLastMinute.length >= this.maxRequestsPerMinute) {
      const oldestRecentRequest = Math.min(...requestsLastMinute);
      return (oldestRecentRequest + 60 * 1000) - now;
    }
    
    return 1000; // Default wait time
  }
  
  /**
   * Wait until we can make a request
   */
  async waitForAvailableSlot(): Promise<void> {
    const waitTime = this.getTimeUntilNextRequest();
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  /**
   * Remove old requests from tracking
   */
  private cleanupOldRequests(now: number = Date.now()): void {
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    this.requests = this.requests.filter(time => time > oneDayAgo);
  }
  
  /**
   * Get current usage statistics
   */
  getUsageStats(): {
    requestsLastMinute: number;
    requestsLastHour: number;
    requestsLastDay: number;
    remainingMinute: number;
    remainingHour: number;
    remainingDay: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    
    const requestsLastMinute = this.requests.filter(time => time > oneMinuteAgo).length;
    const requestsLastHour = this.requests.filter(time => time > oneHourAgo).length;
    const requestsLastDay = this.requests.filter(time => time > oneDayAgo).length;
    
    return {
      requestsLastMinute,
      requestsLastHour,
      requestsLastDay,
      remainingMinute: Math.max(0, this.maxRequestsPerMinute - requestsLastMinute),
      remainingHour: Math.max(0, this.maxRequestsPerHour - requestsLastHour),
      remainingDay: Math.max(0, this.maxRequestsPerDay - requestsLastDay),
    };
  }
  
  /**
   * Reset all rate limiting (use with caution)
   */
  reset(): void {
    this.requests = [];
  }
}

// Export a singleton instance
export const openaiRateLimiter = new OpenAIRateLimiter();