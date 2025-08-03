# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


7 Claude rules
1. First think through the problem, read the codebase for relevant files, and write a plan to tasks/todo.md.
2. The plan should have a list of todo items that you can check off as you complete them
3. Before you begin working, check in with me and I will verify the plan.
4. Then, begin working on the todo items, marking them as complete as you go.
5. Please every step of the way just give me a high level explanation of what changes you made
6. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
7. Finally, add a review section to the [todo.md](http://todo.md/) file with a summary of the changes you made and any other relevant information.


# Amazon Storefront Tracker

## Project Overview
A sophisticated Amazon arbitrage analysis platform that tracks storefronts, analyzes products across European marketplaces, and identifies profitable cross-border opportunities. Built with Next.js 15, Supabase, and extensive Amazon SP-API integration.

## Development Commands
```bash
npm run dev              # Development server (localhost:3000)
npm run build            # Production build with type checking
npm run start            # Production server
npm run lint             # ESLint with Next.js rules
npm run test             # Playwright E2E tests (cross-browser)
npm run test:ui          # Playwright tests with UI mode
npm run test:headed      # Playwright tests in headed browser
npm run test:sp-api      # Test Amazon SP-API connection
npm run sync:catalog     # Sync product catalog from Amazon
```

## Key Architecture Decisions

### Core Technologies
- **Next.js 15.4.5** with App Router for server-side rendering and API routes
- **Supabase** for authentication, database (PostgreSQL), and Row Level Security
- **TypeScript** for type safety across the codebase
- **Playwright** for cross-browser E2E testing

### API Architecture
- All API routes in `/src/app/api/` use Next.js 14+ route handlers
- Authentication via Supabase JWT in Authorization header
- Service role key for server-side database operations only

### Rate Limiting Strategy
- **Amazon SP-API Rate Limits**: 
  - getCatalogItem: 2 requests/second (burst: 2)
  - searchCatalogItems: 2 requests/second (burst: 2)
  - getCompetitivePricing: 10 requests/second (burst: 30)
  - getMyFeesEstimate: 1 request/second (burst: 2)
- Custom token bucket rate limiter in `sp-api-rate-limiter.ts`
- Automatic retry with exponential backoff on rate limit errors
- Initial requests use 1.5s delay to avoid burst capacity issues

### Database Migration Patterns
- Use `CREATE TABLE IF NOT EXISTS` for new tables
- Use `CREATE INDEX IF NOT EXISTS` to avoid conflicts
- Migration files in `/supabase/` directory
- RLS policies should be dropped and recreated to ensure consistency

### Streaming API Architecture
- Server-sent events (SSE) for real-time arbitrage analysis updates
- Stream implementation in `/api/arbitrage/analyze-stream/route.ts`
- Message format: `data: {type, data}\n\n`
- Message types: `progress`, `opportunity`, `complete`, `error`
- Client-side error handling must not throw to maintain stream

## Critical Implementation Details

### Product Sync Flow
1. **Keepa API** fetches ASINs from seller storefront (50 tokens per page)
2. **Batch Processing**: Process 20 ASINs at a time with SP-API
3. **Rate Limiting**: 500ms delay between requests (1.5s for first 5)
4. **Error Recovery**: Exponential backoff starting at 60s for quota errors
5. **Database Updates**: Bulk upsert to products table with conflict handling

### Arbitrage Analysis Flow
1. **Data Collection**: Fetch pricing from all EU marketplaces concurrently
2. **Fee Calculation**: UK Amazon fees (15% + £3) + 2% digital services fee
3. **Currency Conversion**: EUR to GBP at 0.86 rate (from exchange-rates.ts)
4. **Opportunity Detection**: Profit > 0 and positive ROI calculation
5. **Scan Persistence**: All scans saved to arbitrage_scans and arbitrage_opportunities tables

### British English Localization
- analyse (not analyze)
- synchronise (not synchronize)
- catalogue (not catalog)
- colour (not color)
- optimise (not optimize)

## Database Schema

### Core Tables
- `storefronts`: Amazon seller storefronts with seller_id (unique constraint)
- `products`: ASINs with pricing, availability, last sync timestamp
- `arbitrage_scans`: Scan history with status tracking
- `arbitrage_opportunities`: Profitable opportunities found during scans

### Migration Order (if needed)
1. `create_storefronts_table.sql`
2. `create_products_table.sql`
3. `migrate_arbitrage_tables.sql` (upgrades old structure)
4. `add_unique_constraint_seller_id.sql`

## Common Issues & Solutions

1. **"Failed to create scan record"**
   - Run `migrate_arbitrage_tables.sql` in Supabase SQL editor
   - Ensures arbitrage_scans and arbitrage_opportunities tables exist

2. **Rate Limit Errors (429)**
   - SP-API has strict rate limits (2 req/sec for catalog)
   - Implementation includes automatic retry with backoff
   - Check sp-api-rate-limiter.ts for token bucket configuration

3. **No Products Found During Sync**
   - Verify Keepa API key is valid
   - Check storefront has valid seller_id format
   - Ensure seller has products listed on Amazon UK

4. **Authentication Errors**
   - Verify all environment variables are set correctly
   - Check Supabase JWT token is valid and not expired
   - Ensure RLS policies are configured for user isolation

## Environment Variables (Required)
All stored in `.env.local`:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Amazon SP-API
- `AMAZON_ACCESS_KEY_ID` (SP-API App Client ID)
- `AMAZON_SECRET_ACCESS_KEY` (SP-API App Client Secret)
- `AMAZON_REFRESH_TOKEN` (From SP-API app authorization)
- `AMAZON_MARKETPLACE_ID` (UK: A1F83G8C2ARO7P)

### AWS IAM (for AssumeRole)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (eu-west-1)

### External APIs
- `KEEPA_API_KEY`

## Testing Strategy
- Playwright for E2E tests in `/tests` directory
- Tests run on Chromium, Firefox, and WebKit
- Development server auto-starts for tests
- Use `npm run test:ui` for interactive debugging
- SP-API connection tests via `npm run test:sp-api`

## API Route Organization
```
/api/
├── arbitrage/         # Arbitrage analysis endpoints
├── catalog/           # Amazon catalog item lookups
├── fees/              # Amazon fee calculations
├── pricing/           # Competitive pricing data
├── storefronts/       # Storefront management
└── sync-storefront-*  # Various sync endpoints
```

## Performance Considerations
- Batch API requests where possible (20 ASINs per batch)
- Use streaming for long-running operations
- Implement client-side caching for frequently accessed data
- Database indexes on asin, seller_id, and timestamp fields