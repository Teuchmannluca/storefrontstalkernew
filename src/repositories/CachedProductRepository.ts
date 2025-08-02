import { IProductRepository } from '@/domain/interfaces/IProductRepository';
import { Product } from '@/domain/models/Product';
import { ICacheService, CacheKeyBuilder } from '@/infrastructure/caching/ICacheService';

/**
 * Cached wrapper for ProductRepository
 */
export class CachedProductRepository implements IProductRepository {
  private cacheKeys: CacheKeyBuilder;
  private readonly PRODUCT_TTL = 3600; // 1 hour
  private readonly PRODUCT_LIST_TTL = 300; // 5 minutes

  constructor(
    private repository: IProductRepository,
    private cache: ICacheService
  ) {
    this.cacheKeys = new CacheKeyBuilder('repo');
  }

  async findByASIN(asin: string): Promise<Product | null> {
    const cacheKey = this.cacheKeys.product(asin);
    
    return this.cache.wrap(
      cacheKey,
      () => this.repository.findByASIN(asin),
      this.PRODUCT_TTL
    );
  }

  async findByASINs(asins: string[]): Promise<Product[]> {
    // Check cache for individual products first
    const cachedProducts: Product[] = [];
    const uncachedAsins: string[] = [];
    
    for (const asin of asins) {
      const cached = await this.cache.get<Product>(this.cacheKeys.product(asin));
      if (cached) {
        cachedProducts.push(cached);
      } else {
        uncachedAsins.push(asin);
      }
    }
    
    // Fetch uncached products
    if (uncachedAsins.length > 0) {
      const freshProducts = await this.repository.findByASINs(uncachedAsins);
      
      // Cache individual products
      for (const product of freshProducts) {
        await this.cache.set(
          this.cacheKeys.product(product.asin),
          product,
          this.PRODUCT_TTL
        );
      }
      
      cachedProducts.push(...freshProducts);
    }
    
    return cachedProducts;
  }

  async findByStorefront(storefrontId: string): Promise<Product[]> {
    const cacheKey = this.cacheKeys.storefrontProducts(storefrontId);
    
    const products = await this.cache.wrap(
      cacheKey,
      () => this.repository.findByStorefront(storefrontId),
      this.PRODUCT_LIST_TTL
    );
    
    // Also cache individual products
    for (const product of products) {
      await this.cache.set(
        this.cacheKeys.product(product.asin),
        product,
        this.PRODUCT_TTL
      );
    }
    
    return products;
  }

  async upsert(product: Product): Promise<Product> {
    const result = await this.repository.upsert(product);
    
    // Invalidate caches
    await this.cache.delete(this.cacheKeys.product(product.asin));
    
    // Invalidate storefront cache if product has storefronts
    if (product.storefronts?.length) {
      for (const storefrontId of product.storefronts) {
        await this.cache.deletePattern(`*:storefront:${storefrontId}:*`);
      }
    }
    
    // Cache the new product
    await this.cache.set(
      this.cacheKeys.product(result.asin),
      result,
      this.PRODUCT_TTL
    );
    
    return result;
  }

  async upsertBatch(products: Product[]): Promise<Product[]> {
    const results = await this.repository.upsertBatch(products);
    
    // Invalidate all affected caches
    const affectedStorefronts = new Set<string>();
    
    for (const product of products) {
      await this.cache.delete(this.cacheKeys.product(product.asin));
      
      if (product.storefronts?.length) {
        product.storefronts.forEach(id => affectedStorefronts.add(id));
      }
    }
    
    // Invalidate storefront caches
    for (const storefrontId of affectedStorefronts) {
      await this.cache.deletePattern(`*:storefront:${storefrontId}:*`);
    }
    
    // Cache the new products
    for (const product of results) {
      await this.cache.set(
        this.cacheKeys.product(product.asin),
        product,
        this.PRODUCT_TTL
      );
    }
    
    return results;
  }
}