import { createClient } from '@supabase/supabase-js';

/**
 * Service for managing ASIN blacklist functionality
 */
export class BlacklistService {
  private supabase;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Fetch all blacklisted ASINs for a user
   */
  async getBlacklistedAsins(userId: string): Promise<Set<string>> {
    try {
      const { data, error } = await this.supabase
        .from('asin_blacklist')
        .select('asin')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching blacklisted ASINs:', error);
        return new Set();
      }

      return new Set(data?.map((item: any) => item.asin) || []);
    } catch (error) {
      console.error('Error in getBlacklistedAsins:', error);
      return new Set();
    }
  }

  /**
   * Check if a specific ASIN is blacklisted for a user
   */
  async isAsinBlacklisted(userId: string, asin: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('asin_blacklist')
        .select('id')
        .eq('user_id', userId)
        .eq('asin', asin.toUpperCase())
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error checking ASIN blacklist status:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error in isAsinBlacklisted:', error);
      return false;
    }
  }

  /**
   * Filter out blacklisted ASINs from a list of products
   */
  filterBlacklistedProducts<T extends { asin: string }>(
    products: T[],
    blacklistedAsins: Set<string>
  ): { filteredProducts: T[]; excludedCount: number } {
    const filteredProducts = products.filter((product: any) => 
      !blacklistedAsins.has(product.asin.toUpperCase())
    );

    return {
      filteredProducts,
      excludedCount: products.length - filteredProducts.length
    };
  }
}