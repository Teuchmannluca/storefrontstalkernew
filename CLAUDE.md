# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Amazon Storefront Tracker

## Project Overview
A sophisticated Amazon arbitrage analysis platform that tracks storefronts, analyzes products across European marketplaces, and identifies profitable cross-border opportunities. Built with Next.js, Supabase, and extensive Amazon SP-API integration.

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
```

## Key Architecture Decisions

### Rate Limiting Strategy
- **Amazon SP-API Rate Limits**: 
  - getCatalogItem: 2 requests/second (burst: 2)
  - searchCatalogItems: 2 requests/second (burst: 2)
  - getCompetitivePricing: 10 requests/second (burst: 30)
  - getMyFeesEstimate: 1 request/second (burst: 2)
- Implementation uses custom rate limiter with token bucket algorithm
- Automatic retry with exponential backoff on rate limit errors

### Database Migration Patterns
- Use `CREATE TABLE IF NOT EXISTS` for new tables
- Use `CREATE INDEX IF NOT EXISTS` to avoid conflicts
- Backup existing tables before structural changes
- RLS policies should be dropped and recreated to ensure consistency

### Streaming API Architecture
- Server-sent events (SSE) for real-time arbitrage analysis updates
- Stream messages format: `data: {type, data}\n\n`
- Message types: `progress`, `opportunity`, `complete`, `error`
- Client-side error handling must not throw to maintain stream

### Authentication Flow
- All API routes require Bearer token in Authorization header
- Supabase JWT validation on every request
- Service role key used for server-side operations only
- Row Level Security ensures complete user data isolation

## Critical Implementation Details

### Product Sync Flow
1. **Keepa API** fetches ASINs from seller storefront (50 tokens per page)
2. **Batch Processing**: Process 20 ASINs at a time with SP-API
3. **Rate Limiting**: 500ms delay between requests (1.5s for first 5)
4. **Error Recovery**: Exponential backoff starting at 60s for quota errors

### Arbitrage Analysis
1. **Data Collection**: Fetch pricing from all EU marketplaces
2. **Fee Calculation**: UK Amazon fees + 2% digital services fee
3. **Currency Conversion**: EUR to GBP at 0.86 rate
4. **Opportunity Detection**: Profit > 0 and positive ROI
5. **Scan Persistence**: All scans saved to database for history

### British English Localization
- analyse (not analyze)
- synchronise (not synchronize)
- catalogue (not catalog)
- colour (not color)
- optimise (not optimize)

## Database Schema Updates

### Arbitrage Scan Tables (Required)
```sql
-- Check if tables exist before running migrations
-- Use migrate_arbitrage_tables.sql if upgrading from old structure
-- Tables: arbitrage_scans, arbitrage_opportunities
-- All have RLS policies for user isolation
```

### Common Issues & Solutions

1. **"Failed to create scan record"**
   - Run `migrate_arbitrage_tables.sql` in Supabase SQL editor
   - Ensures arbitrage_scans and arbitrage_opportunities tables exist

2. **Rate Limit Errors**
   - SP-API has strict rate limits (2 req/sec for catalog)
   - Implementation includes automatic retry with backoff
   - First 5 requests use 1.5s delay to avoid initial burst

3. **No Products Found**
   - Must sync products before analysis
   - Keepa API required for initial ASIN discovery
   - Check storefront has valid seller_id

## Environment Variables (Required)
All stored in `.env.local`:

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Amazon SP-API
- `AMAZON_ACCESS_KEY_ID` (Client ID)
- `AMAZON_SECRET_ACCESS_KEY` (Client Secret)
- `AMAZON_REFRESH_TOKEN`
- `AMAZON_MARKETPLACE_ID` (UK: A1F83G8C2ARO7P)

### AWS IAM
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