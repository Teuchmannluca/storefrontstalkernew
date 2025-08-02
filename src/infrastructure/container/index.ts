import 'reflect-metadata';
import { container } from 'tsyringe';
import { SupabaseClient } from '@supabase/supabase-js';

// Services
import { ArbitrageAnalysisService } from '@/services/arbitrage/ArbitrageAnalysisService';
import { IArbitrageService } from '@/domain/interfaces/IArbitrageService';
import { StreamingService } from '@/services/streaming/StreamingService';

// Repositories
import { ProductRepository } from '@/repositories/ProductRepository';
import { ArbitrageScanRepository } from '@/repositories/ArbitrageScanRepository';
import { IProductRepository } from '@/domain/interfaces/IProductRepository';
import { IArbitrageScanRepository } from '@/domain/interfaces/IArbitrageScanRepository';

// External Services
import { AmazonSPAPIAdapter } from '@/infrastructure/external-apis/AmazonSPAPIAdapter';
import { IExternalPricingService } from '@/domain/interfaces/IExternalPricingService';

// Cache
import { ICacheService } from '@/domain/interfaces/ICacheService';
import { InMemoryCacheService } from '@/infrastructure/cache/InMemoryCacheService';
import { RedisCacheService } from '@/infrastructure/cache/RedisCacheService';

// Decorators
import { createCachedRepository } from '@/infrastructure/decorators/CachedRepository';

// Tokens for injection
export const TOKENS = {
  SupabaseClient: Symbol.for('SupabaseClient'),
  ArbitrageService: Symbol.for('ArbitrageService'),
  ProductRepository: Symbol.for('ProductRepository'),
  ArbitrageScanRepository: Symbol.for('ArbitrageScanRepository'),
  ExternalPricingService: Symbol.for('ExternalPricingService'),
  CacheService: Symbol.for('CacheService'),
  StreamingService: Symbol.for('StreamingService'),
} as const;

export function initializeContainer(supabaseClient: SupabaseClient): void {
  // Register Supabase client
  container.register<SupabaseClient>(TOKENS.SupabaseClient, {
    useValue: supabaseClient,
  });

  // Register Cache Service - use Redis if available, fallback to in-memory
  container.register<ICacheService>(TOKENS.CacheService, {
    useFactory: () => {
      if (process.env.REDIS_URL) {
        console.log('[Container] Using Redis cache');
        return new RedisCacheService();
      } else {
        console.log('[Container] Using in-memory cache');
        return new InMemoryCacheService();
      }
    },
  });

  // Register Repositories
  container.register<IProductRepository>(TOKENS.ProductRepository, {
    useFactory: (c) => {
      const repository = new ProductRepository(c.resolve(TOKENS.SupabaseClient));
      const cacheService = c.resolve<ICacheService>(TOKENS.CacheService);
      return createCachedRepository(repository, cacheService, 'products');
    },
  });

  container.register<IArbitrageScanRepository>(TOKENS.ArbitrageScanRepository, {
    useFactory: (c) => new ArbitrageScanRepository(c.resolve(TOKENS.SupabaseClient)),
  });

  // Register External Services
  container.register<IExternalPricingService>(TOKENS.ExternalPricingService, {
    useClass: AmazonSPAPIAdapter,
  });

  // Register Domain Services
  container.register<IArbitrageService>(TOKENS.ArbitrageService, {
    useFactory: (c) => new ArbitrageAnalysisService(
      c.resolve(TOKENS.ProductRepository),
      c.resolve(TOKENS.ExternalPricingService),
      c.resolve(TOKENS.ArbitrageScanRepository)
    ),
  });

  // Register Infrastructure Services
  container.register<StreamingService>(TOKENS.StreamingService, {
    useClass: StreamingService,
  });
}

export { container };