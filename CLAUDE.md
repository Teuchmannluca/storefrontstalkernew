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
9. Use the Supabase MCP server for all database operations
10. Always make sure we have the updated docs and use the Context7 MCP to pull up-to-date documentation

## Critical SP-API Property Casing
**EXTREMELY IMPORTANT**: Amazon SP-API responses use **PascalCase** (uppercase) property names, not camelCase:
- ✅ `CompetitivePrices` (NOT competitivePrices)
- ✅ `CompetitivePriceId` (NOT competitivePriceId)
- ✅ `Price.ListingPrice.Amount` (NOT price.listingPrice.amount)
- ✅ `NumberOfOfferListings` (NOT numberOfOfferListings)
- ✅ `Product.CompetitivePricing` (NOT product.competitivePricing)
- ✅ `Product.SalesRankings` (NOT product.salesRankings)

**Debugging Note**: If arbitrage analysis shows "No UK pricing for ASIN" despite fetching data, check property casing first!


# Amazon Storefront Tracker

## Project Overview
A sophisticated Amazon arbitrage analysis platform that tracks storefronts, analyzes products across European marketplaces, and identifies profitable cross-border opportunities. Built with Next.js 15, Supabase, and extensive Amazon SP-API integration.

## Development Commands
```bash
npm run dev              # Development server (localhost:3000)
npm run build            # Production build with type checking
npm run start            # Production server
npm run lint             # ESLint with Next.js rules
npm run sync:catalog     # Sync product catalog from Amazon

# Testing Scripts (Node.js)
node test-fees-api.js           # Test fees calculation API
node test-specific-asin.js      # Test single ASIN processing
node test-fees-comprehensive.js # Comprehensive fees testing
node test-live-api.js          # Test live API connections
node test-debug-auth.js        # Test authentication flow
node test-enrichment-flow.js   # Test title enrichment process
node test-trigger-enrichment.js # Test enrichment triggering
```

## Next.js 15 Compatibility Notes
- **Route Parameters**: All dynamic route parameters are now Promises that must be awaited
- **Example**: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`
- **TypeScript**: Ensure proper typing for async route parameters to avoid build errors

## Key Architecture Decisions

### Core Technologies
- **Next.js 15.4.5** with App Router for server-side rendering and API routes
- **Supabase** for authentication, database (PostgreSQL), and Row Level Security
- **TypeScript** for type safety with decorator support for dependency injection
- **Vercel** for deployment with cron job scheduling
- **Tailwind CSS** for styling with Headless UI components

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
  - getCompetitivePricing: 10 requests/second (burst: 30) - **Reduced to 0.5 req/sec in code to avoid quota errors**
  - getMyFeesEstimate: 1 request/second (burst: 2)
- Custom token bucket rate limiter in `sp-api-rate-limiter.ts`
- Competitive pricing client uses its own rate limiter with 2s intervals between requests
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

### Scheduled Operations Architecture
- **Cron Jobs**: Two main scheduled operations via Vercel cron
  - Storefront updates: Daily at 2:00 AM UTC (`/api/cron/check-schedules`)
  - Arbitrage scans: Daily at 3:15 AM UTC (`/api/cron/check-arbitrage-schedules`)
- **User Schedule Tables**: 
  - `user_schedule_settings` for storefront sync scheduling
  - `user_arbitrage_schedule_settings` for A2A EU scan scheduling
- **Scheduling Features**: Frequency (daily/every 2 days/weekly), time zones, days of week selection
- **Automatic Next Run Calculation**: Database triggers calculate next execution time

## Critical Implementation Details

### Product Sync Flow
1. **Keepa API** fetches ASINs from seller storefront (50 tokens per page)
2. **Batch Processing**: Process 10-20 ASINs at a time with SP-API (reduced for quota management)
3. **Rate Limiting**: 500ms delay between requests (1.5s for first 5)
4. **Enhanced Quota Management**: SPAPIQuotaManager tracks daily usage and implements cooldown periods
5. **Error Recovery**: Exponential backoff starting at 60s for quota errors
6. **Database Updates**: Bulk upsert to products table with conflict handling

### Arbitrage Analysis Flow
1. **ASIN Collection**: Comprehensive collection of all ASINs from all user storefronts
2. **Deduplication**: Remove duplicate ASINs while tracking which storefronts carry each product
3. **Blacklist Filtering**: Exclude user-blacklisted ASINs before analysis starts
4. **Progress Streaming**: Real-time updates showing collection statistics and filtering results
5. **Data Collection**: Fetch pricing from all EU marketplaces concurrently
6. **Sales Data Integration**: Use actual sales_per_month from products table or calculate from sales rank
7. **Fee Calculation**: UK Amazon fees (15% + £3) + 2% digital services fee
8. **Currency Conversion**: EUR to GBP at 0.86 rate (from exchange-rates.ts)
9. **Opportunity Detection**: All deals categorized (profitable/break-even/loss)
10. **Scan Persistence**: All deals saved to arbitrage_scans and arbitrage_opportunities tables with profit_category

### ASIN Blacklist Feature
- **Purpose**: Allow users to exclude specific ASINs from arbitrage analysis
- **Use Cases**: Low-profit products, problematic suppliers, restricted items
- **Implementation**: Check blacklist before processing each product batch
- **UI**: Dedicated blacklist management page with add/remove functionality
- **Scope**: Both single seller and all seller scans respect blacklist
- **Performance**: Efficient Set-based filtering with minimal impact on scan speed

### Sourcing Lists Feature
- **Purpose**: Save and organize profitable arbitrage opportunities from scans
- **Key Features**:
  - Create multiple lists with names and descriptions
  - Add deals from Recent Scans and A2A EU pages via "Add to List" buttons
  - Bulk selection and individual item addition support
  - Automatic profit and item count calculations via database triggers
  - Individual item deletion with confirmation modal
  - Favorite lists for quick access
- **Database**: `sourcing_lists` and `sourcing_list_items` tables with RLS policies
- **UI Integration**: Buttons placed next to WhatsApp share buttons for easy access

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
- `sourcing_lists`: User-created lists to organize profitable deals from scans
- `sourcing_list_items`: Individual arbitrage opportunities saved to sourcing lists

### Scheduling Tables
- `user_schedule_settings`: Storefront update scheduling configuration
- `user_arbitrage_schedule_settings`: A2A EU arbitrage scan scheduling configuration
- Both tables include: enabled, frequency, time_of_day, timezone, days_of_week, scan_type (arbitrage only)
- Views: `schedules_due_for_execution` and `arbitrage_schedules_due_for_execution` for cron queries

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
7. `create_user_schedule_settings.sql` (storefront update scheduling)
8. `create_user_arbitrage_schedule_settings.sql` (A2A EU scan scheduling)
9. `create_sourcing_lists_tables.sql` (Sourcing lists for organizing profitable deals)

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

5. **"No UK pricing for ASIN" Despite Fetching Data**
   - **Primary Cause**: SP-API property casing mismatch
   - SP-API returns PascalCase properties (e.g., `CompetitivePrices`)
   - Code must access with exact casing: `product.competitivePricing?.CompetitivePrices`
   - TypeScript won't catch this at compile time - runtime error only
   - **Solution**: Always use PascalCase when accessing SP-API response properties

6. **Products Not Being Analyzed**
   - Check logs for "No UK pricing" messages
   - Verify SP-API property casing is correct
   - Ensure pricing data mapping uses correct property paths
   - Add debug logging to trace pricing data flow

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

### Cron Jobs
- `CRON_SECRET` (optional, defaults to 'default-secret')
- `NEXT_PUBLIC_SITE_URL` (for internal API calls from cron jobs)

## Vercel Deployment Configuration
- **Region**: CDG1 (Paris)
- **Function Timeouts**: 300s (5 minutes) for long-running operations:
  - `/api/arbitrage/analyze-stream`
  - `/api/sync-products`
  - `/api/sync-storefront-products`
  - `/api/catalog/sync-products`
  - `/api/cron/check-schedules`
  - `/api/cron/check-arbitrage-schedules`
- **Cron Jobs**:
  - Storefront updates: `0 2 * * *` (2:00 AM UTC daily)
  - Arbitrage scans: `15 3 * * *` (3:15 AM UTC daily)


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
├── cron/
│   ├── check-schedules/     # Storefront update scheduling
│   └── check-arbitrage-schedules/ # A2A EU scan scheduling
├── fees/
│   └── comprehensive/       # Comprehensive fee calculation
├── pricing/
│   ├── competitive/         # Competitive pricing data
│   ├── offers/             # Product offers
│   └── offers-batch/       # Batch offers lookup
├── sourcing-lists/          # Sourcing lists management
│   ├── route.ts            # List CRUD operations
│   ├── add-items/          # Bulk add items to lists
│   ├── [id]/              # Single list operations
│   └── [id]/items/        # List items management
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

## Key Components Architecture

### Scheduling Components
- **ScheduleSettings.tsx**: Storefront update scheduling UI (frequency, time, timezone)
- **ArbitrageScheduleSettings.tsx**: A2A EU scan scheduling UI with scan type selection
- Both components load/save to respective schedule settings tables
- Real-time display of last run and next scheduled run times

### Main Dashboard Pages
- **A2A EU page** (`/dashboard/a2a-eu/`): Single/all seller arbitrage analysis with streaming updates
- **Recent Scans page** (`/dashboard/recent-scans/`): Historical scan results with profit filtering
- **Sourcing Lists page** (`/dashboard/sourcing-lists/`): Organize and manage saved arbitrage opportunities
- **Settings page** (`/dashboard/settings/`): User configuration including both scheduling systems
- **Blacklist page** (`/dashboard/blacklist/`): ASIN exclusion management

### Reusable UI Components
- **SavedScansPanel/SavedScansInline**: Historical scan display with filtering
- **SourcingListModal**: Modal for adding deals to sourcing lists with create-on-the-fly functionality
- **Sidebar**: Main navigation with active state management
- **UpdateProgressBar**: Real-time sync progress display
- **SyncButton variants**: Immediate sync triggers for storefronts

## Key Utilities and Libraries
- **Rate Limiting**: `sp-api-rate-limiter.ts` (token bucket implementation)
- **Enhanced Quota Management**: `QuotaManager.ts` and `EnhancedRateLimiter.ts` for SP-API quota handling
- **SP-API Competitive Pricing**: `sp-api-competitive-pricing.ts` (MUST use PascalCase properties)
- **Sales Estimation**: `sales-estimator.ts` (BSR to monthly sales conversion)
- **Profit Categorization**: `profit-categorizer.ts` (profitable/break-even/loss classification)
- **Batch Progress Tracking**: `batch-progress-tracker.ts` for real-time sync progress
- **Blacklist Service**: `blacklist-service.ts` (efficient ASIN filtering)
- **Authentication**: `auth.ts` and `validateApiRequest()` for JWT validation
- **Error Handling**: `error-handling.ts` with streaming-safe error management
- **Exchange Rates**: `exchange-rates.ts` (EUR to GBP conversion)

## Git Workflow & Version Control
- **Before Major Changes**: Always commit current working state
- **Property Casing Changes**: Be extremely careful when changing SP-API response property access
- **Reverting to Working Version**: Use `git checkout <commit-hash> -- <file-path>` for specific files
- **Testing After Changes**: Always test arbitrage analysis after SP-API modifications