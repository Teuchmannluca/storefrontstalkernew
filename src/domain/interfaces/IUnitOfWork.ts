export interface IUnitOfWork {
  /**
   * Begin a new transaction
   */
  begin(): Promise<void>;
  
  /**
   * Commit the current transaction
   */
  commit(): Promise<void>;
  
  /**
   * Rollback the current transaction
   */
  rollback(): Promise<void>;
  
  /**
   * Execute a function within a transaction
   * Automatically handles begin, commit, and rollback
   */
  executeInTransaction<T>(
    work: () => Promise<T>
  ): Promise<T>;
  
  /**
   * Get repository instances that participate in this unit of work
   */
  getProductRepository(): IProductRepository;
  getScanRepository(): IArbitrageScanRepository;
}

import { IProductRepository } from './IProductRepository';
import { IArbitrageScanRepository } from './IArbitrageScanRepository';