# Product Fees API Documentation

## Overview
The Product Fees API allows you to estimate Amazon fees for products before listing them. This helps in calculating profitability and making pricing decisions.

## Features
- Get fee estimates for individual ASINs or SKUs
- Batch process multiple products (up to 20 at once)
- Support for different fulfillment programs (FBA, FBM)
- Detailed fee breakdown including referral fees, FBA fees, and closing fees

## API Endpoints

### 1. Single ASIN Fee Estimate
**Endpoint:** `POST /api/fees/estimate-asin`

**Request Body:**
```json
{
  "asin": "B09418HSPT",
  "price": "29.99",
  "currency": "GBP",
  "shipping": "4.99",  // Optional
  "fulfillmentProgram": "FBA_CORE"  // Optional: FBA_CORE, FBA_SNL, FBA_EFN
}
```

**Response:**
```json
{
  "success": true,
  "asin": "B09418HSPT",
  "price": {
    "currencyCode": "GBP",
    "amount": 29.99
  },
  "fees": {
    "referralFee": {
      "currencyCode": "GBP",
      "amount": 4.50
    },
    "variableClosingFee": {
      "currencyCode": "GBP",
      "amount": 0.30
    },
    "fbaFees": {
      "currencyCode": "GBP",
      "amount": 3.21
    },
    "totalFees": {
      "currencyCode": "GBP",
      "amount": 8.01
    },
    "allFees": [
      {
        "type": "ReferralFee",
        "amount": { "currencyCode": "GBP", "amount": 4.50 }
      }
    ]
  },
  "estimatedAt": "2024-01-15T10:30:00Z"
}
```

### 2. Batch Fee Estimates
**Endpoint:** `POST /api/fees/estimate-batch`

**Request Body:**
```json
{
  "requests": [
    {
      "idType": "ASIN",
      "asin": "B09418HSPT",
      "price": "29.99",
      "currency": "GBP",
      "fulfillmentProgram": "FBA_CORE"
    },
    {
      "idType": "ASIN",
      "asin": "B09MD6H8FH",
      "price": "49.99",
      "currency": "GBP"
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
      "idType": "ASIN",
      "idValue": "B09418HSPT",
      "fees": { /* fee details */ }
    },
    {
      "success": true,
      "idType": "ASIN",
      "idValue": "B09MD6H8FH",
      "fees": { /* fee details */ }
    }
  ],
  "totalRequested": 2,
  "successful": 2,
  "failed": 0
}
```

## Fee Types
Common fee types you'll see in responses:
- **ReferralFee**: Amazon's commission (typically 15% for most categories)
- **VariableClosingFee**: Per-item fee for media products
- **FBAFees**: Fulfillment fees for FBA products
- **FBAPickAndPackFee**: Handling fee for FBA
- **FBAWeightBasedFee**: Shipping fee based on weight/size

## Rate Limits
- Product Fees API: 10 requests per second
- Batch requests count as 1 request regardless of items

## Error Handling
The API returns appropriate error messages:
- `400`: Invalid request parameters
- `401`: Authentication failed
- `429`: Rate limit exceeded
- `500`: Server error

## Configuration
Required environment variables:
```env
# SP-API Credentials
AMAZON_ACCESS_KEY_ID=your_sp_api_app_id
AMAZON_SECRET_ACCESS_KEY=your_sp_api_app_secret
AMAZON_REFRESH_TOKEN=your_refresh_token
AMAZON_SELLER_ID=your_seller_id
AMAZON_MARKETPLACE_ID=A1F83G8C2ARO7P  # UK marketplace

# AWS Credentials
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=eu-west-1
```

## Testing
Use the provided test script:
```bash
node test-product-fees-api.js
```

Make sure to replace `YOUR_SUPABASE_AUTH_TOKEN` with a valid auth token.