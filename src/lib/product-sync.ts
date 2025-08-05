import { createClient } from '@supabase/supabase-js';
import SPAPIClient from './sp-api';

export interface ProductSyncResult {
  success: boolean;
  productsUpdated: number;
  errors: Array<{ asin: string; error: string }>;
}

export class ProductSyncService {
  private spApiClient: SPAPIClient;
  private supabaseAdmin;

  constructor() {
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
    };
    
    this.spApiClient = new SPAPIClient(credentials, config);
    
    // Initialize Supabase admin client
    this.supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  async syncAllProducts(): Promise<ProductSyncResult> {
    const result: ProductSyncResult = {
      success: true,
      productsUpdated: 0,
      errors: []
    };

    try {
      // Get all products that need syncing
      const { data: products, error } = await this.supabaseAdmin
        .from('products')
        .select('id, asin')
        .or('sync_status.eq.pending,last_synced_at.lt.now() - interval \'6 hours\'')
        .limit(50); // Process in batches to avoid rate limits

      if (error) {
        throw error;
      }

      if (!products || products.length === 0) {
        return result;
      }

      // Process each product
      for (const product of products) {
        await this.syncProduct(product.id, product.asin, result);
      }

    } catch (error) {
      console.error('Sync all products error:', error);
      result.success = false;
    }

    return result;
  }

  async syncProduct(productId: string, asin: string, result: ProductSyncResult): Promise<void> {
    try {
      // Update status to syncing
      await this.supabaseAdmin
        .from('products')
        .update({ sync_status: 'syncing' })
        .eq('id', productId);

      // Fetch product details from SP-API
      const productDetails = await this.spApiClient.getProductByASIN(asin);

      // Update product in database
      const { error: updateError } = await this.supabaseAdmin
        .from('products')
        .update({
          title: productDetails.title,
          brand: productDetails.brand,
          main_image_url: productDetails.mainImage,
          sales_ranks: productDetails.salesRanks,
          sync_status: 'success',
          sync_error: null,
          last_synced_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        })
        .eq('id', productId);

      if (updateError) {
        throw updateError;
      }

      result.productsUpdated++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update product with error status
      await this.supabaseAdmin
        .from('products')
        .update({
          sync_status: 'error',
          sync_error: errorMessage,
          last_updated: new Date().toISOString()
        })
        .eq('id', productId);

      result.errors.push({ asin, error: errorMessage });
    }
  }

  async syncProductByASIN(asin: string): Promise<void> {
    try {
      // Fetch product details from SP-API
      const productDetails = await this.spApiClient.getProductByASIN(asin);

      // Update all products with this ASIN
      const { error } = await this.supabaseAdmin
        .from('products')
        .update({
          title: productDetails.title,
          brand: productDetails.brand,
          main_image_url: productDetails.mainImage,
          sales_ranks: productDetails.salesRanks,
          sync_status: 'success',
          sync_error: null,
          last_synced_at: new Date().toISOString(),
          last_updated: new Date().toISOString()
        })
        .eq('asin', asin);

      if (error) {
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update products with error status
      await this.supabaseAdmin
        .from('products')
        .update({
          sync_status: 'error',
          sync_error: errorMessage,
          last_updated: new Date().toISOString()
        })
        .eq('asin', asin);
      
      throw error;
    }
  }
}