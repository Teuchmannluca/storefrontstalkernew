import { SupabaseClient } from '@supabase/supabase-js';
import { ArbitrageAnalysisService } from '@/services/arbitrage/ArbitrageAnalysisService';
import { ProductRepository } from '@/repositories/ProductRepository';
import { ArbitrageScanRepository } from '@/repositories/ArbitrageScanRepository';
import { AmazonSPAPIAdapter } from '@/infrastructure/external-apis/AmazonSPAPIAdapter';

export class DIContainer {
  private static instance: DIContainer;
  private services: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  registerSupabase(supabase: SupabaseClient): void {
    this.services.set('supabase', supabase);
  }

  getArbitrageService(): ArbitrageAnalysisService {
    let service = this.services.get('arbitrageService');
    
    if (!service) {
      const supabase = this.services.get('supabase');
      if (!supabase) {
        throw new Error('Supabase client not registered');
      }

      const productRepository = new ProductRepository(supabase);
      const scanRepository = new ArbitrageScanRepository(supabase);
      const pricingService = new AmazonSPAPIAdapter();

      service = new ArbitrageAnalysisService(
        productRepository,
        pricingService,
        scanRepository
      );

      this.services.set('arbitrageService', service);
    }

    return service;
  }

  getProductRepository(): ProductRepository {
    let repository = this.services.get('productRepository');
    
    if (!repository) {
      const supabase = this.services.get('supabase');
      if (!supabase) {
        throw new Error('Supabase client not registered');
      }

      repository = new ProductRepository(supabase);
      this.services.set('productRepository', repository);
    }

    return repository;
  }

  getScanRepository(): ArbitrageScanRepository {
    let repository = this.services.get('scanRepository');
    
    if (!repository) {
      const supabase = this.services.get('supabase');
      if (!supabase) {
        throw new Error('Supabase client not registered');
      }

      repository = new ArbitrageScanRepository(supabase);
      this.services.set('scanRepository', repository);
    }

    return repository;
  }
}