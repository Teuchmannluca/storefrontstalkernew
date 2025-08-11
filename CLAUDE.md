# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Workflow Rules
1. First analyse the problem, read relevant codebase files, and create a plan using TodoWrite tool
2. Before implementing, present the plan using ExitPlanMode tool for approval when appropriate
3. Work on todo items one at a time, marking them as complete as you progress
4. **Critical**: For any Supabase database changes, always use the MCP Supabase server tools rather than writing raw SQL files
5. Use the Supabase MCP server (`mcp__supabase__*`) for all database operations
6. Always fetch updated documentation using Context7 MCP when working with external libraries

## Development Commands
```bash
npm run dev              # Development server (localhost:3000)
npm run build            # Production build with type checking
npm run start            # Production server
npm run lint             # ESLint with Next.js rules

# Testing Scripts (Node.js) - Located in root directory
node test-fees-api.js           # Test fees calculation API
node test-keepa-analysis.js     # Test Keepa API integration
node test-enrichment-flow.js    # Test title enrichment process
```

## Critical SP-API Property Casing
**EXTREMELY IMPORTANT**: Amazon SP-API responses use **PascalCase** property names:
- ✅ `CompetitivePrices` (NOT competitivePrices)
- ✅ `Price.ListingPrice.Amount` (NOT price.listingPrice.amount)
- ✅ `Product.CompetitivePricing` (NOT product.competitivePricing)

**Debugging**: If "No UK pricing for ASIN" appears despite fetching data, check property casing first.

## High-Level Architecture

### Core Stack
- **Next.js 15.4.5** with App Router (async route parameters must be awaited)
- **Supabase** for auth, PostgreSQL database, and RLS
- **TypeScript** with dependency injection via tsyringe
- **Vercel** deployment with cron job scheduling
- **MCP Integration** for Supabase operations (Project ID: `wushjxsdmnapsigcwwct`)

### Architecture Layers
- **Domain**: Business logic in `/src/domain/` (aggregates, services, value objects)
- **Infrastructure**: External integrations in `/src/infrastructure/` (APIs, cache, rate limiting)
- **Application**: API routes in `/src/app/api/` using Next.js 15 route handlers
- **Repository Pattern**: Data access abstraction with caching decorators

### Critical Rate Limiting
SP-API enforces strict limits - implementation uses custom rate limiters:
- `getCompetitivePricing`: Reduced to 0.5 req/sec (avoid quota errors)
- `getCatalogItem`: 2 req/sec with token bucket implementation
- Automatic exponential backoff on 429 errors
- Enhanced quota management via `SPAPIQuotaManager`

### Streaming Architecture
- Server-sent events (SSE) for real-time arbitrage analysis
- Message format: `data: {type, data}\n\n`
- Types: `progress`, `opportunity`, `complete`, `error`
- Supabase has 1000 row default limit - pagination required for large datasets

## Key Business Logic Flows

### Product Sync Flow
1. Keepa API fetches ASINs from storefront (50 tokens/page)
2. Batch process 20 ASINs with SP-API
3. Rate limiting with delays and quota tracking
4. Bulk upsert to products table

### Arbitrage Analysis Flow
1. Collect ASINs from storefronts with deduplication
2. Filter blacklisted ASINs before processing
3. Stream progress updates in real-time
4. Fetch UK + EU marketplace pricing concurrently
5. Calculate fees: UK Amazon (15% + £3) + 2% digital services
6. EUR to GBP conversion at 0.86 rate
7. Categorize deals: profitable (>£0.50), break-even (±£0.50), loss (<-£0.50)
8. Save all deals to `arbitrage_opportunities` table

### Manual Operations (No cron jobs)
- Storefront updates: Run manually via API endpoint `/api/cron/check-schedules`
- Arbitrage scans: Run manually via API endpoint `/api/cron/check-arbitrage-schedules`
- Keepa enrichment: Run `node run-keepa-enrichment.js` or call `/api/cron/keepa-enrichment`
- User-configurable scheduling via `user_schedule_settings` tables (requires manual trigger)

## Database Schema Key Tables
- `storefronts`: Seller storefronts with unique seller_id
- `products`: ASINs with pricing, sales_per_month, current_sales_rank
- `arbitrage_scans`: Scan history with progress tracking (progress_percentage, current_step, processed_count)
- `arbitrage_opportunities`: All deals with profit_category classification
- `asin_blacklist`: User-specific ASIN exclusions
- `sourcing_lists` & `sourcing_list_items`: Saved profitable deals

## Common Issues & Solutions

1. **"No UK pricing for ASIN"**: Check SP-API property casing (PascalCase)
2. **Rate limit 429 errors**: Automatic retry with backoff implemented
3. **Only 1000 opportunities shown**: Implement pagination for Supabase queries
4. **Build errors with route params**: Await Promise params in Next.js 15
5. **Authentication failures**: Verify Supabase JWT and RLS policies

## Environment Variables
Required in `.env.local`:
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- SP-API: `AMAZON_ACCESS_KEY_ID`, `AMAZON_SECRET_ACCESS_KEY`, `AMAZON_REFRESH_TOKEN`
- AWS IAM: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- External: `KEEPA_API_KEY`
- Deployment: `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Deployment
- Manual deployment via `./deploy.sh` script
- Process management with PM2 (optional)
- Manual triggering of background tasks (no cron jobs)
- Run `node run-keepa-enrichment.js` for Keepa data updates

## Key Utilities
- `sp-api-rate-limiter.ts`: Token bucket rate limiting
- `sp-api-competitive-pricing.ts`: Pricing client (PascalCase properties!)
- `sales-estimator.ts`: BSR to monthly sales conversion
- `profit-categorizer.ts`: Deal classification logic
- `blacklist-service.ts`: Efficient ASIN filtering
- `batch-progress-tracker.ts`: Real-time sync progress

## British English Localization
Use: analyse, synchronise, catalogue, colour, optimise (not -ize variants)