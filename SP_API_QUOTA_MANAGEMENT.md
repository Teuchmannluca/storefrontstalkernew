# SP-API Quota Management System

## Overview
This document describes the robust quota management system implemented to handle Amazon SP-API quota exceeded errors.

## Key Components

### 1. **SPAPIQuotaManager** (`src/infrastructure/sp-api/QuotaManager.ts`)
- Tracks daily quota usage for each SP-API operation
- Implements cooldown periods when quota is exceeded
- Provides quota status monitoring
- Configurable retry-after periods

### 2. **EnhancedSPAPIRateLimiter** (`src/infrastructure/sp-api/EnhancedRateLimiter.ts`)
- Token bucket implementation for rate limiting
- Exponential backoff for retries
- Concurrent request queuing
- Automatic retry with configurable delays

### 3. **ResilientSPAPIClient** (`src/infrastructure/sp-api/ResilientSPAPIClient.ts`)
- Wraps SP-API calls with automatic retry logic
- Implements caching to reduce API calls
- Batch processing with conservative limits
- Sequential marketplace processing to avoid quota issues

## Configuration

### Rate Limits
```typescript
getCompetitivePricing: {
  requestsPerSecond: 0.2,  // 1 request per 5 seconds
  burstCapacity: 1,
  dailyQuota: 7200,
  retryAfter: 3600  // 1 hour
}
```

### Batch Processing
- Maximum 10 ASINs per batch (instead of 20)
- 5-second delay between batches
- 10-second delay between marketplaces

## Usage

The system is automatically integrated through dependency injection:

```typescript
// In your service
constructor(
  @inject(TOKENS.ExternalPricingService) private pricingService: IExternalPricingService
) {}

// The pricingService now uses ResilientPricingAdapter with all quota management
```

## Monitoring

Check quota status:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/sp-api/quota-status
```

## Error Handling

When quota is exceeded:
1. System enters cooldown period (default: 1 hour)
2. Requests are queued and retried after cooldown
3. Cached data is used when available
4. Fallback fee estimates are provided

## Best Practices

1. **Use caching**: All successful responses are cached
2. **Batch requests**: Process multiple ASINs together
3. **Monitor quotas**: Check status regularly
4. **Plan analysis**: Run large scans during off-peak hours

## Troubleshooting

### "You exceeded your quota" Error
- Check quota status endpoint
- Wait for cooldown period to expire
- Reduce request frequency
- Use cached data when possible

### Performance Tips
- Enable Redis caching for better performance
- Process storefronts sequentially, not in parallel
- Use the streaming API for real-time progress updates