# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Amazon Storefront Tracker

## Project Overview
A sophisticated Amazon arbitrage analysis platform that tracks storefronts, analyzes products across European marketplaces, and identifies profitable cross-border opportunities. Built with Next.js, Supabase, and extensive Amazon SP-API integration.

## Tech Stack & Architecture
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS with violet/indigo gradient theme
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)
- **Authentication**: Supabase Auth with JWT validation
- **APIs**: Amazon SP-API, Keepa API, real-time exchange rates
- **Testing**: Playwright for E2E testing
- **UI Components**: Headless UI, Heroicons

## Core Business Logic
This is an **Amazon arbitrage analysis tool** that:
1. Tracks Amazon storefronts by seller ID across EU markets
2. Fetches product data using Amazon SP-API and Keepa
3. Calculates fees, shipping costs, and profit margins
4. Identifies arbitrage opportunities between EU → UK markets
5. Provides real-time competitive pricing analysis

## Project Structure
```
/src
  /app
    /api                    # 28+ API endpoints for data processing
      /arbitrage           # Cross-marketplace arbitrage analysis
      /catalog            # Amazon catalog search endpoints  
      /fees               # SP-API fee calculation endpoints
      /pricing            # Competitive pricing APIs
      /products           # Product CRUD and sync operations
      /sync               # Background sync job endpoints
    /dashboard            # Protected dashboard pages
      /a2a-eu            # Amazon-to-Amazon EU arbitrage page
      /products          # Product management interface
      /storefronts       # Storefront management page
    page.tsx            # Login-only landing page
    layout.tsx          # Root layout with auth guards
    globals.css         # Tailwind theme (violet/indigo gradients)
  
  /components           # Reusable UI components
    Sidebar.tsx         # Navigation (Dashboard, Storefronts, Products, A2A EU)
    AddStorefrontModal.tsx  # Storefront creation modal
    Various sync components with status indicators
  
  /lib
    supabase.ts         # Supabase client with auth
    amazon-sp-api.ts    # SP-API client with rate limiting
    keepa-api.ts        # Keepa API integration
  
  /utils                # Business logic utilities
    fee-calculator.ts   # Amazon fee calculations
    arbitrage-analyzer.ts # Profit margin analysis

/supabase
  create_tables.sql     # Database schema with RLS policies
```

## Database Architecture
### Core Tables with RLS
1. **Storefronts** - User's tracked Amazon seller storefronts
   - Links to Products with cascade delete
   - Auto-generates marketplace URLs for EU markets
   
2. **Products** - Product data linked to storefronts
   - ASIN, title, image, brand, sales ranks (JSONB)
   - Sync status tracking (pending/syncing/success/error)
   - Last synced timestamps and error logging
   
3. **Arbitrage Opportunities** (if implemented)
   - Cross-marketplace pricing analysis
   - Profit calculations with fees and shipping
   - ROI and margin percentages

### Key Features
- **Row Level Security (RLS)** - Complete user data isolation
- **JSONB Storage** - Flexible sales rank and metadata storage
- **Cascade Deletes** - Automatic cleanup of related data
- **Comprehensive Indexing** - Optimized for ASIN, profit, marketplace queries

## Key Architectural Patterns

### API Integration Architecture
- **Amazon SP-API Clients**: Product catalog, competitive pricing, fees calculation
- **Rate Limiting**: Built-in throttling with retry mechanisms for SP-API compliance
- **AWS STS Integration**: Role-based credential management for SP-API access
- **Keepa API**: Alternative product data source with custom rate limiting
- **Background Sync**: Scheduled product data updates with status tracking

### Authentication & Security
- **Supabase Auth**: JWT-based authentication with automatic token refresh
- **API Route Protection**: Bearer token validation in all API endpoints
- **Row Level Security**: Database-level user isolation
- **Service Role Access**: Server-side operations with elevated permissions

### Data Flow Patterns
1. **Storefront → Product Discovery**: Keepa API extracts ASINs from seller pages
2. **Background Sync**: SP-API fetches product details, images, sales ranks
3. **Arbitrage Analysis**: Real-time cross-marketplace price comparison with fee calculations
4. **Profit Optimization**: ROI and margin calculations with currency conversion

### Component Architecture
- **Modal System**: Reusable modals for storefront/product management
- **Sync Status Components**: Real-time sync progress indicators
- **Search & Filter**: ASIN validation and product search across storefronts
- **Responsive Design**: Mobile-first with violet/indigo gradient theme

## Development Commands
```bash
npm run dev              # Development server (localhost:3000 or 3001)
npm run build            # Production build with type checking
npm run start            # Production server
npm run lint             # ESLint with Next.js rules
npm run test             # Playwright E2E tests (cross-browser)
npm run test:sp-api      # Test Amazon SP-API connection and credentials
npm run sync:catalog     # Manual catalog sync (if implemented)
```

## API Testing & Development
```bash
# Test SP-API credentials and marketplace access
curl -X POST http://localhost:3000/api/sp-api/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Trigger arbitrage analysis for a storefront
curl -X POST http://localhost:3000/api/arbitrage/analyze \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storefrontId": "uuid-here"}'

# Manual product sync
curl -X POST http://localhost:3000/api/sync/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Environment Variables
Critical for full functionality - store in `.env.local`:

### Supabase Configuration
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Server-side operations
```

### Amazon SP-API Credentials (Required for arbitrage analysis)
```bash
AMAZON_ACCESS_KEY_ID=your-sp-api-client-id
AMAZON_SECRET_ACCESS_KEY=your-sp-api-client-secret
AMAZON_REFRESH_TOKEN=your-long-lived-refresh-token
AMAZON_SELLER_ID=your-seller-or-solution-id
AMAZON_MARKETPLACE_ID=A1F83G8C2ARO7P  # UK marketplace
AMAZON_REGION=eu-west-1
```

### AWS IAM Credentials (Required for SP-API access)
```bash
AWS_ACCESS_KEY_ID=your-iam-access-key
AWS_SECRET_ACCESS_KEY=your-iam-secret-key
AWS_REGION=eu-west-1
```

### External APIs
```bash
KEEPA_API_KEY=your-keepa-api-key  # Product discovery
EXCHANGE_RATE_API_KEY=your-api-key  # Currency conversion (optional)
```

### Background Processing
```bash
SYNC_SECRET_TOKEN=your-secret-token  # Secure sync endpoints
NEXT_PUBLIC_SYNC_ENABLED=true  # Enable auto-sync features
```

## SP-API Integration
### Product Details by ASIN
Fetch product information using Amazon's SP-API:
- **Endpoint**: `/api/products/[asin]`
- **Data Retrieved**:
  - Main product image
  - Product name/title
  - Sales rank (by category)
  - Brand name
- **Required Credentials**:
  - SP-API Access Key ID
  - SP-API Secret Access Key
  - Refresh Token
  - Client ID & Client Secret
  - Marketplace ID (UK: A1F83G8C2ARO7P)

### Background Product Sync
Automatic synchronization of product data:
- **Sync Endpoint**: `/api/sync/products`
- **Features**:
  - Automatic sync on product addition
  - Periodic batch sync (every 6 hours)
  - Manual sync trigger via API
  - Sync status tracking in database
- **Database Fields**:
  - sync_status: pending, syncing, success, error
  - last_synced_at: Timestamp of last successful sync
  - sync_error: Error message if sync failed

## Future Enhancements
- Product tracking per storefront
- Price change monitoring
- Analytics dashboard
- Bulk import/export functionality
- Multi-region Amazon support
- Automated data fetching