import { ArbitrageScan, ArbitrageOpportunity } from '../models/ArbitrageOpportunity';

export interface IArbitrageScanRepository {
  create(data: {
    userId: string;
    storefrontId?: string;
    asins?: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    productsScanned: number;
    opportunitiesFound: number;
    startedAt: Date;
    error?: string;
  }): Promise<ArbitrageScan>;
  
  update(
    id: string, 
    data: {
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      productsScanned?: number;
      opportunitiesFound?: number;
      completedAt?: Date;
      error?: string;
    }
  ): Promise<void>;
  
  findById(id: string): Promise<ArbitrageScan | null>;
  
  findByUserId(userId: string, limit?: number): Promise<ArbitrageScan[]>;
  
  addOpportunity(scanId: string, opportunity: ArbitrageOpportunity): Promise<void>;
}