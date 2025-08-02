export interface IDistributedRateLimiter {
  /**
   * Wait for available tokens before proceeding
   * @param endpoint The API endpoint being rate limited
   * @param tokensRequested Number of tokens needed
   * @returns Promise that resolves when tokens are available
   */
  waitForTokens(endpoint: string, tokensRequested: number): Promise<void>;
  
  /**
   * Check if tokens are available without waiting
   * @param endpoint The API endpoint being rate limited
   * @param tokensRequested Number of tokens to check
   * @returns True if tokens are available
   */
  hasTokens(endpoint: string, tokensRequested: number): Promise<boolean>;
  
  /**
   * Consume tokens from the bucket
   * @param endpoint The API endpoint being rate limited
   * @param tokens Number of tokens to consume
   * @returns True if tokens were consumed successfully
   */
  consumeTokens(endpoint: string, tokens: number): Promise<boolean>;
  
  /**
   * Get current token count for an endpoint
   * @param endpoint The API endpoint being rate limited
   * @returns Current number of available tokens
   */
  getTokenCount(endpoint: string): Promise<number>;
}

export interface RateLimitConfig {
  endpoint: string;
  maxTokens: number;
  refillRate: number; // tokens per second
  burstCapacity?: number;
}