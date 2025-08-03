# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Development Workflow Rules
1. First analyse the problem, read relevant codebase files, and create a plan using TodoWrite tool
2. The plan should have specific, actionable todo items with priorities (high/medium/low)
3. Before implementing, present the plan using ExitPlanMode tool for approval
4. Work on todo items one at a time, marking them as complete as you progress
5. Keep changes simple and focused - avoid massive or complex modifications
6. Provide high-level explanations of changes made
7. **Critical**: For any Supabase database changes, always use the MCP Supabase server tools rather than writing raw SQL files
8. After completion, update TodoWrite with a summary of changes made 
9. Use the Superbase MCP server
10 , Always make sure we have the update doc and use the Context7 MCP pulls up-to-date

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
npm run test:sp-api      # Test Amazon SP-API connection (basic)
npm run test:sp-api-v2   # Test SP-API connection (v2)
npm run test:sp-api-endpoints  # Test specific SP-API endpoints
npm run sync:catalog     # Sync product catalog from Amazon
```

## Test Scripts (Node.js)
```bash
node test-fees-api.sh           # Test fees calculation API
node test-specific-asin.js      # Test single ASIN processing
node test-fees-comprehensive.js # Comprehensive fees testing
node test-live-api.js          # Test live API connections
```

## Key Architecture Decisions

### Core Technologies
- **Next.js 15.4.5** with App Router for server-side rendering and API routes
- **Supabase** for authentication, database (PostgreSQL), and Row Level Security
- **TypeScript** for type safety across the codebase
- **Playwright** for cross-browser E2E testing

### API Architecture
- All API routes in `/src/app/api/` use Next.js 15 route handlers (App Router)
- Authentication via Supabase JWT in Authorization header
- Service role key for server-side database operations only
- MCP (Model Context Protocol) integration for Supabase operations
- Domain-driven design with dependency injection (`DIContainer.ts`)

### Architecture Layers
- **Domain Layer**: Business logic in `/src/domain/` (aggregates, interfaces, services, value objects)
- **Infrastructure Layer**: External integrations in `/src/infrastructure/` (APIs, cache, database, rate limiting)
- **Application Layer**: API routes and services coordinate between layers
- **Presentation Layer**: React components and pages in `/src/app/` and `/src/components/`
- **Repository Pattern**: Data access abstraction in `/src/repositories/`

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
2. **Blacklist Filtering**: Exclude user-blacklisted ASINs before analysis
3. **Sales Data Integration**: Use actual sales_per_month from products table or calculate from sales rank
4. **Fee Calculation**: UK Amazon fees (15% + £3) + 2% digital services fee
5. **Currency Conversion**: EUR to GBP at 0.86 rate (from exchange-rates.ts)
6. **Opportunity Detection**: All deals categorized (profitable/break-even/loss)
7. **Scan Persistence**: All deals saved to arbitrage_scans and arbitrage_opportunities tables with profit_category

### ASIN Blacklist Feature
- **Purpose**: Allow users to exclude specific ASINs from arbitrage analysis
- **Use Cases**: Low-profit products, problematic suppliers, restricted items
- **Implementation**: Check blacklist before processing each product batch
- **UI**: Dedicated blacklist management page with add/remove functionality
- **Scope**: Both single seller and all seller scans respect blacklist
- **Performance**: Efficient Set-based filtering with minimal impact on scan speed

### Break-Even Deals Feature
- **Purpose**: Show deals that are neither profitable nor loss-making (around £0 profit)
- **Categories**: 
  - **Profitable**: profit > £0.50 (green indicators)
  - **Break-Even**: profit between -£0.50 and £0.50 (amber indicators)
  - **Loss**: profit < -£0.50 (red indicators)
- **UI Controls**: Multi-state filter in A2A EU and Recent Scans pages
  - "Profitable Only" (default)
  - "Include Break-Even" 
  - "Show All Deals"
- **Implementation**: All deals saved to database with `profit_category` classification
- **Use Cases**: Identify products close to profitability, price optimization opportunities

### British English Localization
- analyse (not analyze)
- synchronise (not synchronize)
- catalogue (not catalog)
- colour (not color)
- optimise (not optimize)

## Database Schema

### Core Tables
- `storefronts`: Amazon seller storefronts with seller_id (unique constraint)
- `products`: ASINs with pricing, availability, sales_per_month, current_sales_rank, last sync timestamp
- `arbitrage_scans`: Scan history with status tracking and metadata
- `arbitrage_opportunities`: All deals with profit_category classification (profitable/break-even/loss)
- `asin_blacklist`: User-specific blacklisted ASINs excluded from scans

### Sales Data Integration
- **products.sales_per_month**: Calculated from sales rank using estimateMonthlySalesFromRank()
- **products.current_sales_rank**: Amazon BSR (Best Sellers Rank) from SP-API
- **Fallback Logic**: Use database values first, calculate from rank if null, estimate from SP-API as last resort
- **UI Display**: Show actual sales_per_month when available, estimated values with ~ prefix, "No data" only when neither available

### Migration Order (if needed)
1. `create_storefronts_table.sql`
2. `create_products_table.sql`
3. `migrate_arbitrage_tables.sql` (upgrades old structure)
4. `add_unique_constraint_seller_id.sql`
5. `create_asin_blacklist_table.sql` (ASIN blacklist functionality)
6. `add_profit_category_column.sql` (Break-even deals classification)

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
├── arbitrage/
│   ├── analyze-stream/      # Single seller streaming analysis
│   ├── analyze-all-sellers/ # All sellers streaming analysis
│   ├── analyze-asins/       # Batch ASIN analysis
│   └── scans/[scanId]/      # Retrieve scan results
├── blacklist/               # ASIN blacklist management (GET, POST, DELETE)
├── catalog/
│   ├── item/[asin]/         # Individual ASIN lookup
│   ├── search/              # Catalog search
│   └── sync-products/       # Bulk product sync
├── fees/
│   └── comprehensive/       # Comprehensive fee calculation
├── pricing/
│   ├── competitive/         # Competitive pricing data
│   ├── offers/             # Product offers
│   └── offers-batch/       # Batch offers lookup
├── storefronts/
│   └── update-all/         # Update all storefronts
├── sync-storefront-keepa/   # Keepa API integration
├── sync-storefront-products/ # SP-API product sync with sales data
└── v2/                     # API versioning for new features
```

## MCP (Model Context Protocol) Integration
- **Supabase Operations**: Always use `mcp__supabase__*` tools for database operations
- **Available Tools**: `execute_sql`, `list_tables`, `apply_migration`, `get_logs`, `get_advisors`
- **Project ID**: Use `wushjxsdmnapsigcwwct` for Strefrontstalker project
- **Security**: MCP tools handle authentication and permissions automatically

## Performance Considerations
- Batch API requests where possible (20 ASINs per batch)
- Use streaming for long-running operations (Server-Sent Events)
- Implement client-side caching for frequently accessed data
- Database indexes on asin, seller_id, and timestamp fields
- Token bucket rate limiting with burst capacity for SP-API
- Concurrent marketplace pricing requests with staggered delays
- Efficient Set-based blacklist filtering
- Sales data calculated once during sync, cached in database

## Key Utilities and Libraries
- **Rate Limiting**: `sp-api-rate-limiter.ts` (token bucket implementation)
- **Sales Estimation**: `sales-estimator.ts` (BSR to monthly sales conversion)
- **Profit Categorization**: `profit-categorizer.ts` (profitable/break-even/loss classification)
- **Blacklist Service**: `blacklist-service.ts` (efficient ASIN filtering)
- **Authentication**: `auth.ts` and `validateApiRequest()` for JWT validation
- **Error Handling**: `error-handling.ts` with streaming-safe error management
- **Exchange Rates**: `exchange-rates.ts` (EUR to GBP conversion)