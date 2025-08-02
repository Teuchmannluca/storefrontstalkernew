import { Product } from '../models/Product';

export interface IProductRepository {
  findByASIN(asin: string): Promise<Product | null>;
  findByASINs(asins: string[]): Promise<Product[]>;
  findByStorefront(storefrontId: string): Promise<Product[]>;
  upsert(product: Product): Promise<Product>;
  upsertBatch(products: Product[]): Promise<Product[]>;
}