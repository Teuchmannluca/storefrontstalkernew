import { IProductRepository } from '@/domain/interfaces/IProductRepository';
import { Product } from '@/domain/models/Product';
import { SupabaseClient } from '@supabase/supabase-js';

export class ProductRepository implements IProductRepository {
  constructor(private supabase: SupabaseClient) {}

  async findByASIN(asin: string): Promise<Product | null> {
    const { data, error } = await this.supabase
      .from('products')
      .select('*')
      .eq('asin', asin)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToProduct(data);
  }

  async findByASINs(asins: string[]): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from('products')
      .select('*')
      .in('asin', asins);

    if (error || !data) {
      return [];
    }

    return data.map(this.mapToProduct);
  }

  async findByStorefront(storefrontId: string): Promise<Product[]> {
    const { data: storefront } = await this.supabase
      .from('storefronts')
      .select('seller_id')
      .eq('id', storefrontId)
      .single();

    if (!storefront) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('products')
      .select('*')
      .contains('storefronts', [storefront.seller_id])
      .order('current_sales_rank', { ascending: true, nullsFirst: false })
      .limit(500);

    if (error || !data) {
      return [];
    }

    return data.map(this.mapToProduct);
  }

  async upsert(product: Product): Promise<Product> {
    const dbProduct = this.mapToDbProduct(product);
    
    const { data, error } = await this.supabase
      .from('products')
      .upsert(dbProduct)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return this.mapToProduct(data);
  }

  async upsertBatch(products: Product[]): Promise<Product[]> {
    const dbProducts = products.map(this.mapToDbProduct);
    
    const { data, error } = await this.supabase
      .from('products')
      .upsert(dbProducts)
      .select();

    if (error) {
      throw error;
    }

    return data.map(this.mapToProduct);
  }

  private mapToProduct(dbProduct: any): Product {
    return {
      asin: dbProduct.asin,
      title: dbProduct.title,
      brand: dbProduct.brand,
      category: dbProduct.category,
      imageUrl: dbProduct.image_url,
      currentSalesRank: dbProduct.current_sales_rank,
      salesPerMonth: dbProduct.sales_per_month,
      ukPrice: dbProduct.current_price ? parseFloat(dbProduct.current_price) : undefined,
      availability: dbProduct.availability,
      lastSyncedAt: dbProduct.last_synced_at ? new Date(dbProduct.last_synced_at) : undefined,
      storefronts: dbProduct.storefronts
    };
  }

  private mapToDbProduct(product: Product): any {
    return {
      asin: product.asin,
      title: product.title,
      brand: product.brand,
      category: product.category,
      image_url: product.imageUrl,
      current_sales_rank: product.currentSalesRank,
      sales_per_month: product.salesPerMonth,
      current_price: product.ukPrice?.toString(),
      availability: product.availability,
      last_synced_at: product.lastSyncedAt?.toISOString() || new Date().toISOString(),
      storefronts: product.storefronts
    };
  }
}