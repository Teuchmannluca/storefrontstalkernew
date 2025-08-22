import { OpenAIEnhancedAnalysis } from './openai-deal-enhancer';

interface CacheEntry {
  data: OpenAIEnhancedAnalysis;
  timestamp: number;
  expiresAt: number;
}

export class OpenAICache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
  
  /**
   * Generate a cache key based on the product and market conditions
   */
  private generateCacheKey(
    asin: string,
    currentPrice: number,
    competitorCount: number,
    monthlySales: number
  ): string {
    // Include key factors that affect analysis
    return `${asin}-${Math.round(currentPrice * 100)}-${competitorCount}-${Math.round(monthlySales)}`;
  }
  
  /**
   * Store an OpenAI analysis result in cache
   */
  set(
    asin: string,
    currentPrice: number,
    competitorCount: number,
    monthlySales: number,
    analysis: OpenAIEnhancedAnalysis,
    ttlMs?: number
  ): void {
    const key = this.generateCacheKey(asin, currentPrice, competitorCount, monthlySales);
    const ttl = ttlMs || this.DEFAULT_TTL;
    const now = Date.now();
    
    this.cache.set(key, {
      data: analysis,
      timestamp: now,
      expiresAt: now + ttl,
    });
    
    // Clean up expired entries periodically
    this.cleanup();
  }
  
  /**
   * Retrieve an OpenAI analysis result from cache
   */
  get(
    asin: string,
    currentPrice: number,
    competitorCount: number,
    monthlySales: number
  ): OpenAIEnhancedAnalysis | null {
    const key = this.generateCacheKey(asin, currentPrice, competitorCount, monthlySales);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  /**
   * Check if we have a cached result for this product
   */
  has(
    asin: string,
    currentPrice: number,
    competitorCount: number,
    monthlySales: number
  ): boolean {
    return this.get(asin, currentPrice, competitorCount, monthlySales) !== null;
  }
  
  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => this.cache.delete(key));
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    activeEntries: number;
    expiredEntries: number;
    hitRate?: number;
  } {
    const now = Date.now();
    let activeEntries = 0;
    let expiredEntries = 0;
    
    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expiredEntries++;
      } else {
        activeEntries++;
      }
    }
    
    return {
      totalEntries: this.cache.size,
      activeEntries,
      expiredEntries,
    };
  }
  
  /**
   * Force cleanup of all expired entries
   */
  forceCleanup(): number {
    const sizeBefore = this.cache.size;
    this.cleanup();
    return sizeBefore - this.cache.size;
  }
}

// Export a singleton instance
export const openaiCache = new OpenAICache();