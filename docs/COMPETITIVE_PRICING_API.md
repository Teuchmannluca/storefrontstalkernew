# Competitive Pricing API Documentation

## Overview
The Competitive Pricing API provides pricing intelligence for Amazon products, including:
- Competitive prices from other sellers
- Buy Box prices
- Number of offers by condition
- Sales rankings
- Detailed offer listings with seller information

## API Endpoints

### 1. Get Competitive Pricing
**Endpoint:** `POST /api/pricing/competitive`

Get competitive pricing information for up to 20 ASINs.

**Request Body:**
```json
{
  "asins": ["B09418HSPT", "B09MD6H8FH"],
  "marketplaceId": "A1F83G8C2ARO7P",  // Optional, defaults to UK
  "itemType": "Asin",  // "Asin" or "Sku"
  "customerType": "Consumer"  // Optional: "Consumer" or "Business"
}
```

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "asin": "B09418HSPT",
      "marketplaceId": "A1F83G8C2ARO7P",
      "competitivePrices": [
        {
          "id": "1",
          "price": {
            "currencyCode": "GBP",
            "amount": 29.99
          },
          "condition": "New",
          "offerType": "B2C",
          "belongsToRequester": false
        }
      ],
      "lowestPrice": {
        "currencyCode": "GBP",
        "amount": 28.99
      },
      "buyBoxPrice": {
        "currencyCode": "GBP",
        "amount": 29.99
      },
      "numberOfOffers": {
        "New": 15,
        "Used": 3
      },
      "salesRankings": [
        {
          "category": "lawn_and_garden_display_on_website",
          "rank": 1234
        }
      ]
    }
  ],
  "requestedAsins": ["B09418HSPT", "B09MD6H8FH"],
  "returnedCount": 2
}
```

### 2. Get Item Offers
**Endpoint:** `POST /api/pricing/offers`

Get detailed offer listings for a single ASIN.

**Request Body:**
```json
{
  "asin": "B09418HSPT",
  "marketplaceId": "A1F83G8C2ARO7P",  // Optional
  "itemCondition": "New",  // "New", "Used", "Collectible", "Refurbished", "All"
  "customerType": "Consumer"  // Optional: "Consumer", "Business", "All"
}
```

**Response:**
```json
{
  "success": true,
  "asin": "B09418HSPT",
  "marketplaceId": "A1F83G8C2ARO7P",
  "summary": {
    "totalOffers": 15,
    "lowestPrice": {
      "condition": "New",
      "fulfillmentChannel": "Merchant",
      "landedPrice": {
        "currencyCode": "GBP",
        "amount": 32.98
      },
      "listingPrice": {
        "currencyCode": "GBP",
        "amount": 28.99
      },
      "shipping": {
        "currencyCode": "GBP",
        "amount": 3.99
      }
    },
    "buyBoxPrice": {
      "condition": "New",
      "offerType": "B2C",
      "landedPrice": {
        "currencyCode": "GBP",
        "amount": 29.99
      }
    },
    "salesRankings": [
      {
        "productCategoryId": "lawn_and_garden_display_on_website",
        "rank": 1234
      }
    ]
  },
  "offers": [
    {
      "sellerId": "A1234567890",
      "price": {
        "currencyCode": "GBP",
        "amount": 28.99
      },
      "shipping": {
        "currencyCode": "GBP",
        "amount": 3.99
      },
      "totalPrice": {
        "currencyCode": "GBP",
        "amount": 32.98
      },
      "condition": "New",
      "shippingTime": {
        "minimumHours": 24,
        "maximumHours": 48
      },
      "isBuyBoxWinner": false,
      "isFeaturedMerchant": true,
      "isPrime": false,
      "sellerRating": {
        "count": 1523,
        "rating": 98
      }
    }
  ],
  "lowestPricedOffers": [
    // Top 5 lowest priced offers
  ],
  "requestedCondition": "New"
}
```

### 3. Batch Get Offers
**Endpoint:** `POST /api/pricing/offers-batch`

Get offers for multiple ASINs in a single request (max 20).

**Request Body:**
```json
{
  "requests": [
    {
      "asin": "B09418HSPT",
      "itemCondition": "New",
      "customerType": "Consumer"
    },
    {
      "asin": "B09MD6H8FH",
      "itemCondition": "New"
    },
    {
      "asin": "B06XWYWBFV",
      "itemCondition": "Used"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "asin": "B09418HSPT",
      "marketplaceId": "A1F83G8C2ARO7P",
      "summary": {
        "totalOffers": 15,
        "lowestPrice": { /* price details */ },
        "buyBoxPrice": { /* price details */ }
      },
      "offers": [ /* top 10 offers */ ]
    }
  ],
  "totalRequested": 3,
  "successful": 3,
  "failed": 0
}
```

## Data Fields

### Price Objects
```typescript
{
  currencyCode: string;  // e.g., "GBP", "USD"
  amount: number;        // e.g., 29.99
}
```

### Offer Details
- **sellerId**: Amazon seller ID
- **price**: Item price (excluding shipping)
- **shipping**: Shipping cost
- **totalPrice**: Combined price + shipping
- **condition**: Item condition (New, Used, etc.)
- **isBuyBoxWinner**: Whether this offer wins the Buy Box
- **isFeaturedMerchant**: Featured merchant status
- **isPrime**: Prime eligibility
- **sellerRating**: Seller feedback rating and count

### Sales Rankings
- **productCategoryId**: Amazon category identifier
- **rank**: Sales rank within that category

## Rate Limits
**IMPORTANT**: The Competitive Pricing API has strict rate limits:
- **All endpoints**: 0.5 requests per second (1 request every 2 seconds)
- **Burst capacity**: 1 request
- Batch operations count as a single request

## Best Practices

1. **Use Batch Operations**: When checking multiple ASINs, use batch endpoints to stay within rate limits
2. **Cache Results**: Store pricing data locally and update periodically
3. **Handle Rate Limits**: Implement exponential backoff when receiving 429 errors
4. **Monitor Competitiveness**: Track your position relative to Buy Box price and lowest prices

## Error Handling
```json
{
  "error": "Maximum 20 ASINs per request",
  "status": 400
}
```

Common errors:
- `400`: Invalid request parameters
- `401`: Authentication failed
- `429`: Rate limit exceeded
- `500`: Server error

## Use Cases

1. **Price Monitoring**: Track competitor prices for your products
2. **Buy Box Analysis**: Understand Buy Box pricing dynamics
3. **Repricing Strategy**: Adjust prices based on competition
4. **Market Research**: Analyze pricing trends across categories
5. **Inventory Decisions**: Identify profitable products to stock

## Testing
```bash
# Run the test script
node test-competitive-pricing-api.js
```

Remember to replace `YOUR_SUPABASE_AUTH_TOKEN` with a valid authentication token.