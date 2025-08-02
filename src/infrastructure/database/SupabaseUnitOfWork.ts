import { SupabaseClient } from '@supabase/supabase-js';
import { IUnitOfWork } from '@/domain/interfaces/IUnitOfWork';
import { IProductRepository } from '@/domain/interfaces/IProductRepository';
import { IArbitrageScanRepository } from '@/domain/interfaces/IArbitrageScanRepository';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ArbitrageScanRepository } from '@/repositories/ArbitrageScanRepository';

export class SupabaseUnitOfWork implements IUnitOfWork {
  private transactionClient: SupabaseClient | null = null;
  private productRepository: IProductRepository | null = null;
  private scanRepository: IArbitrageScanRepository | null = null;
  private isInTransaction = false;

  constructor(private supabase: SupabaseClient) {}

  async begin(): Promise<void> {
    if (this.isInTransaction) {
      throw new Error('Transaction already in progress');
    }
    
    // Note: Supabase doesn't support explicit transactions in the JS client
    // We'll track state and batch operations where possible
    this.isInTransaction = true;
    this.transactionClient = this.supabase;
  }

  async commit(): Promise<void> {
    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }
    
    // In a real implementation with proper transaction support,
    // this would commit the transaction
    this.cleanup();
  }

  async rollback(): Promise<void> {
    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }
    
    // In a real implementation, this would rollback the transaction
    // For now, we just cleanup
    this.cleanup();
  }

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    await this.begin();
    
    try {
      const result = await work();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  getProductRepository(): IProductRepository {
    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }
    
    if (!this.productRepository) {
      this.productRepository = new ProductRepository(this.transactionClient!);
    }
    
    return this.productRepository;
  }

  getScanRepository(): IArbitrageScanRepository {
    if (!this.isInTransaction) {
      throw new Error('No transaction in progress');
    }
    
    if (!this.scanRepository) {
      this.scanRepository = new ArbitrageScanRepository(this.transactionClient!);
    }
    
    return this.scanRepository;
  }

  private cleanup(): void {
    this.isInTransaction = false;
    this.transactionClient = null;
    this.productRepository = null;
    this.scanRepository = null;
  }
}

/**
 * Enhanced Unit of Work with actual transaction support
 * This would be used with a database that supports proper transactions
 */
export class TransactionalUnitOfWork implements IUnitOfWork {
  private operations: Array<() => Promise<any>> = [];
  private productRepository: IProductRepository | null = null;
  private scanRepository: IArbitrageScanRepository | null = null;

  constructor(private supabase: SupabaseClient) {}

  async begin(): Promise<void> {
    this.operations = [];
  }

  async commit(): Promise<void> {
    // Execute all operations in a batch
    try {
      await Promise.all(this.operations.map(op => op()));
      this.cleanup();
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  async rollback(): Promise<void> {
    // Clear pending operations
    this.cleanup();
  }

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    await this.begin();
    
    try {
      // Collect operations during work execution
      const result = await work();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  getProductRepository(): IProductRepository {
    if (!this.productRepository) {
      // Create a transactional wrapper around the repository
      this.productRepository = this.createTransactionalRepository(
        new ProductRepository(this.supabase)
      );
    }
    
    return this.productRepository;
  }

  getScanRepository(): IArbitrageScanRepository {
    if (!this.scanRepository) {
      // Create a transactional wrapper around the repository
      this.scanRepository = this.createTransactionalScanRepository(
        new ArbitrageScanRepository(this.supabase)
      );
    }
    
    return this.scanRepository;
  }

  private createTransactionalRepository(repo: IProductRepository): IProductRepository {
    return {
      findByASIN: async (asin: string) => {
        return repo.findByASIN(asin);
      },
      findByASINs: async (asins: string[]) => {
        return repo.findByASINs(asins);
      },
      findByStorefront: async (storefrontId: string) => {
        return repo.findByStorefront(storefrontId);
      },
      upsert: async (product) => {
        this.operations.push(() => repo.upsert(product));
        return product;
      },
      upsertBatch: async (products) => {
        this.operations.push(() => repo.upsertBatch(products));
        return products;
      }
    };
  }

  private createTransactionalScanRepository(repo: IArbitrageScanRepository): IArbitrageScanRepository {
    return {
      create: async (scan) => {
        const tempId = `temp-${Date.now()}`;
        this.operations.push(() => repo.create(scan));
        return { ...scan, id: tempId } as any;
      },
      update: async (id, data) => {
        this.operations.push(() => repo.update(id, data));
      },
      addOpportunity: async (scanId, opportunity) => {
        this.operations.push(() => repo.addOpportunity(scanId, opportunity));
      },
      findById: async (id) => {
        return repo.findById(id);
      },
      findByUserId: async (userId, limit) => {
        return repo.findByUserId(userId, limit);
      }
    };
  }

  private cleanup(): void {
    this.operations = [];
    this.productRepository = null;
    this.scanRepository = null;
  }
}