import { injectable } from 'tsyringe';

export interface QuotaConfig {
  rate: number;           // requests per second
  burst: number;          // burst capacity
  dailyQuota?: number;    // daily quota limit
  retryAfter?: number;    // seconds to wait after quota exceeded
}

export interface QuotaStatus {
  available: boolean;
  resetTime?: Date;
  remainingQuota?: number;
  waitTime?: number;
}

@injectable()
export class SPAPIQuotaManager {
  private quotaConfigs: Map<string, QuotaConfig> = new Map();
  private quotaUsage: Map<string, QuotaUsage> = new Map();
  private quotaExceededUntil: Map<string, number> = new Map();
  
  constructor() {
    // Configure quotas based on SP-API documentation
    this.quotaConfigs.set('getCompetitivePricing', {
      rate: 0.2,      // 1 request per 5 seconds (conservative)
      burst: 1,       // Minimal burst to avoid quota issues
      dailyQuota: 7200,  // Approximate daily limit
      retryAfter: 3600   // 1 hour default retry
    });
    
    this.quotaConfigs.set('getItemOffers', {
      rate: 5,
      burst: 10,
      retryAfter: 300
    });
    
    this.quotaConfigs.set('getCatalogItem', {
      rate: 2,
      burst: 2,
      retryAfter: 300
    });
    
    this.quotaConfigs.set('getMyFeesEstimate', {
      rate: 1,
      burst: 2,
      retryAfter: 300
    });
  }

  async checkQuota(operation: string): Promise<QuotaStatus> {
    const now = Date.now();
    
    // Check if we're in a quota exceeded cooldown period
    const cooldownUntil = this.quotaExceededUntil.get(operation);
    if (cooldownUntil && now < cooldownUntil) {
      const waitTime = Math.ceil((cooldownUntil - now) / 1000);
      return {
        available: false,
        resetTime: new Date(cooldownUntil),
        waitTime
      };
    }
    
    const config = this.quotaConfigs.get(operation);
    if (!config) {
      return { available: true }; // Unknown operation, allow
    }
    
    const usage = this.getOrCreateUsage(operation);
    
    // Check daily quota if configured
    if (config.dailyQuota) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      
      if (usage.lastReset < dayStart.getTime()) {
        // Reset daily counter
        usage.dailyCount = 0;
        usage.lastReset = dayStart.getTime();
      }
      
      if (usage.dailyCount >= config.dailyQuota) {
        const tomorrow = new Date(dayStart);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        return {
          available: false,
          resetTime: tomorrow,
          remainingQuota: 0,
          waitTime: Math.ceil((tomorrow.getTime() - now) / 1000)
        };
      }
    }
    
    return {
      available: true,
      remainingQuota: config.dailyQuota ? config.dailyQuota - usage.dailyCount : undefined
    };
  }

  recordRequest(operation: string): void {
    const usage = this.getOrCreateUsage(operation);
    usage.dailyCount++;
    usage.lastRequest = Date.now();
  }

  recordQuotaExceeded(operation: string, retryAfterSeconds?: number): void {
    const config = this.quotaConfigs.get(operation);
    const retryAfter = retryAfterSeconds || config?.retryAfter || 3600;
    
    const cooldownUntil = Date.now() + (retryAfter * 1000);
    this.quotaExceededUntil.set(operation, cooldownUntil);
    
    console.warn(`[QuotaManager] Quota exceeded for ${operation}. Cooling down for ${retryAfter} seconds until ${new Date(cooldownUntil).toISOString()}`);
  }

  async waitForQuota(operation: string): Promise<void> {
    const status = await this.checkQuota(operation);
    
    if (!status.available && status.waitTime && status.waitTime > 0) {
      const waitTimeMs = status.waitTime * 1000;
      console.log(`[QuotaManager] Waiting ${status.waitTime} seconds for quota to reset...`);
      await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    }
  }

  getQuotaStatus(): Map<string, any> {
    const status = new Map();
    
    for (const [operation, config] of this.quotaConfigs.entries()) {
      const usage = this.quotaUsage.get(operation);
      const cooldownUntil = this.quotaExceededUntil.get(operation);
      
      status.set(operation, {
        config,
        usage: usage || { dailyCount: 0, lastRequest: 0, lastReset: 0 },
        cooldownUntil: cooldownUntil ? new Date(cooldownUntil) : null,
        isAvailable: !cooldownUntil || Date.now() >= cooldownUntil
      });
    }
    
    return status;
  }

  private getOrCreateUsage(operation: string): QuotaUsage {
    if (!this.quotaUsage.has(operation)) {
      this.quotaUsage.set(operation, {
        dailyCount: 0,
        lastRequest: 0,
        lastReset: Date.now()
      });
    }
    return this.quotaUsage.get(operation)!;
  }
}

interface QuotaUsage {
  dailyCount: number;
  lastRequest: number;
  lastReset: number;
}