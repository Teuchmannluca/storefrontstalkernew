import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PriceHistoryEntry {
  user_id: string;
  asin: string;
  marketplace: string;
  old_price?: number;
  new_price: number;
  old_price_currency?: string;
  new_price_currency: string;
  product_name?: string;
  scan_id?: string | null;
}

export class PriceHistoryService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Get the latest price for an ASIN in a specific marketplace
   */
  async getLatestPrice(userId: string, asin: string, marketplace: string): Promise<{
    price: number;
    currency: string;
    last_checked: string;
  } | null> {
    const { data, error } = await this.supabase
      .from('asin_price_history')
      .select('new_price, new_price_currency, change_detected_at')
      .eq('user_id', userId)
      .eq('asin', asin)
      .eq('marketplace', marketplace)
      .order('change_detected_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      price: data.new_price,
      currency: data.new_price_currency,
      last_checked: data.change_detected_at
    };
  }

  /**
   * Get latest prices for multiple ASINs efficiently
   */
  async getLatestPricesForAsins(userId: string, asins: string[]): Promise<Map<string, Map<string, {
    price: number;
    currency: string;
    last_checked: string;
  }>>> {
    const { data, error } = await this.supabase
      .from('latest_asin_price_history')
      .select('*')
      .eq('user_id', userId)
      .in('asin', asins);

    const priceMap = new Map<string, Map<string, any>>();

    if (!error && data) {
      data.forEach((entry: any) => {
        if (!priceMap.has(entry.asin)) {
          priceMap.set(entry.asin, new Map());
        }
        priceMap.get(entry.asin)!.set(entry.marketplace, {
          price: entry.new_price,
          currency: entry.new_price_currency,
          last_checked: entry.change_detected_at
        });
      });
    }

    return priceMap;
  }

  /**
   * Record price changes for multiple marketplaces
   */
  async recordPriceChanges(entries: PriceHistoryEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Prepare insert data
    const insertData = entries.map(entry => ({
      user_id: entry.user_id,
      asin: entry.asin,
      marketplace: entry.marketplace,
      old_price: entry.old_price || null,
      new_price: entry.new_price,
      old_price_currency: entry.old_price_currency || null,
      new_price_currency: entry.new_price_currency,
      product_name: entry.product_name || null,
      scan_id: entry.scan_id || null,
      is_first_check: !entry.old_price
    }));

    const { error } = await this.supabase
      .from('asin_price_history')
      .insert(insertData);

    if (error) {
      console.error('Error recording price history:', error);
      throw error;
    }
  }

  /**
   * Calculate price change details
   */
  calculatePriceChange(oldPrice: number | null, newPrice: number): {
    changeAmount: number | null;
    changePercentage: number | null;
    isSignificant: boolean;
  } {
    if (!oldPrice || oldPrice === 0) {
      return {
        changeAmount: null,
        changePercentage: null,
        isSignificant: false
      };
    }

    const changeAmount = newPrice - oldPrice;
    const changePercentage = (changeAmount / oldPrice) * 100;
    const isSignificant = Math.abs(changePercentage) >= 5; // 5% threshold

    return {
      changeAmount,
      changePercentage,
      isSignificant
    };
  }

  /**
   * Get price history summary for an ASIN
   */
  async getPriceHistorySummary(userId: string, asin: string): Promise<any> {
    const { data, error } = await this.supabase
      .rpc('get_asin_price_history_summary', {
        p_user_id: userId,
        p_asin: asin
      });

    if (error) {
      console.error('Error getting price history summary:', error);
      return null;
    }

    return data;
  }
}