import { ICacheService } from '@/domain/interfaces/ICacheService';

export function createCachedRepository<T extends object>(
  repository: T,
  cacheService: ICacheService,
  keyPrefix: string = 'repo'
): T {
  return new Proxy(repository, {
    get(target, prop, receiver) {
      const originalMethod = Reflect.get(target, prop, receiver);
      
      if (typeof originalMethod !== 'function') {
        return originalMethod;
      }

      // Methods that should not be cached
      const nonCacheableMethods = ['create', 'update', 'delete', 'save'];
      const methodName = String(prop);
      
      if (nonCacheableMethods.some(m => methodName.toLowerCase().includes(m))) {
        return originalMethod;
      }

      return async function (...args: any[]) {
        // Generate cache key
        const cacheKey = `${keyPrefix}:${methodName}:${JSON.stringify(args)}`;
        
        // Try to get from cache
        const cached = await cacheService.get(cacheKey);
        if (cached !== null) {
          console.log(`[Cache] Hit for ${cacheKey}`);
          return cached;
        }

        // Call original method
        const result = await originalMethod.apply(target, args);
        
        // Cache the result
        if (result !== null && result !== undefined) {
          // Cache for 5 minutes by default
          await cacheService.set(cacheKey, result, 300);
          console.log(`[Cache] Set for ${cacheKey}`);
        }

        return result;
      };
    }
  });
}

export function CacheInvalidate(keyPattern: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      const result = await method.apply(this, args);
      
      // Invalidate cache after successful operation
      if (this.cacheService && typeof this.cacheService.invalidatePattern === 'function') {
        await this.cacheService.invalidatePattern(keyPattern);
      }
      
      return result;
    };

    return descriptor;
  };
}