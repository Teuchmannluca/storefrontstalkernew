# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Workflow Rules
1. First analyse the problem, read relevant codebase files, and create a plan using TodoWrite tool
2. Before implementing, present the plan using ExitPlanMode tool for approval when appropriate
3. Work on todo items one at a time, marking them as complete as you progress
4. **Critical**: For any Supabase database changes, always use the MCP Supabase server tools rather than writing raw SQL files
5. Use the Supabase MCP server (`mcp__supabase__*`) for all database operations
6. Always fetch updated documentation using Context7 MCP when working with external libraries



Core Principles
YOU MUST create a plan before making any major changes and ask for explicit user confirmation before continuing. You can only skip this step if the change is trivial.

Don't just blindly follow my plan. Think as an independent engineer when I ask you to do any major work and suggest alternative plans if you have better suggestions.

Environment & Constraints
Development Environment Assumptions
You can assume that a local dev instance of the supabase db is always running; you don't need to control its lifecycle
You should never need to start the dev server unless you need explicit debugging. Assume the user is already running npm run dev
Note that the Playwright tests automatically start up a dev server for testing and won't reuse an existing one. If you need to do testing, either make sure the server is running at port 3000 or start one yourself via "npm run dev"
Restrictions
YOU MUST NEVER run any supabase commands with --linked flag without asking for explicit permission
You don't have the ability to interact with UI, so never run playwright using --debug unless you need explicit help from me
Migration files should NEVER add or modify database entries unless it's required for backwards compatibility issues
Available Tools
You have access to the MCP tool to query db directly to verify changes; use that when appropriate
You have the freedom to create temporary test scripts to verify changes (e.g., custom scripts to trigger API logic and then verify changes in db), but make sure to delete them after you've used them successfully unless you need the user to help you debug
It's fine to create API routes for debugging and test purposes under api/test/ but ensure they are disabled in production
Commands
Development: npm run dev (site), npm run dev:email (email preview)
Build: npm run build
Lint/Format: npm run lint:fix (runs prettier . --fix, eslint --fix, and tsc)
Tests:
Unit/Integration: npm test or npx jest tests/<test_file> (specific test)
E2E: npm run test:e2e or npx playwright test tests/<test_file> (specific test)
Database: npm run db:migrate (apply migrations), npm run db:gentypes (update types)
Code Standards
Style
Use TypeScript for all code; prefer interfaces over types
Use functional components and declarative programming; avoid classes
Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)
Structure: exported component, subcomponents, helpers, static content, types
Prefer server components and minimize 'use client' directives
Use server actions for data fetching and state management
Always check and fix type errors before completing
Naming & Organization
Use lowercase with dashes for directories (e.g., components/auth-wizard)
Favor named exports for components
Use the "function" keyword for pure functions
File Discipline
Don't create internal readme files unnecessarily; they should only be required when the code logic is extremely complex
ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User
Technology Guidelines
Database & Supabase
Use Supabase for auth and database queries
Check database.types.ts before any database work
Always use migrations for schema changes
When generating and running migrations, use the supabase commands rather than creating names yourself
Always use npx supabase command to create migration files
Use createServerClient() (server) or createBrowserClient() (client)
Enable Row Level Security on all tables
During development you are allowed to change migration files that are newly created in the current commit but applying will require a npx supabase db reset to avoid bloating when iterating on migrations
Testing
Follow existing test patterns for the same type (unit, integration, e2e)
For E2E tests, prefer locators in order: getByRole, getByLabel, getByPlaceholder
Validate results directly rather than checking database state
UI Components
Always install shadcn components with npx shadcn@latest add <component_name>
When adding new UI components always consider using shadcn first and install via npx shadcn@latest add <component_name>
Development Workflow
Version Control
Do not include the co-authored with claude note in commit message

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