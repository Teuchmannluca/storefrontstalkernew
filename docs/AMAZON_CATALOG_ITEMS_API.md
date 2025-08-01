# Amazon Catalog Items API Documentation

## Overview

The Amazon Selling Partner API (SP-API) Catalog Items API enables developers to retrieve detailed information about items in the Amazon catalog. This API is essential for sellers and vendors who need to access comprehensive product data programmatically.

**Current Version**: v2022-04-01  
**API Base URL**: `https://sellingpartnerapi-{region}.amazon.com`

## Key Features

- Retrieve detailed item information by ASIN
- Search for catalog items using various identifiers
- Access comprehensive product metadata including:
  - Product attributes and specifications
  - Images and media
  - Sales rankings
  - Product dimensions
  - Browse node classifications
  - Product relationships
  - Vendor-specific details

## Prerequisites

### Authentication Requirements
- **Role Required**: Product Listing role
- **Available Regions**: NA (North America), EU (Europe), FE (Far East)
- **Authentication Method**: SP-API standard authentication with IAM role

### Required Headers
```
x-amz-access-token: {access_token}
x-amz-date: {timestamp}
Authorization: AWS4-HMAC-SHA256 Credential={credentials}
```

## Endpoints

### 1. Search Catalog Items
**Endpoint**: `GET /catalog/2022-04-01/items`

Search for items in the Amazon catalog by identifiers, keywords, or other criteria.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `marketplaceIds` | string | Yes | Comma-separated list of marketplace identifiers |
| `identifiers` | array | No | Array of product identifiers (up to 20) |
| `identifiersType` | string | No | Type of identifier (ASIN, EAN, GTIN, ISBN, JAN, MINSAN, SKU, UPC) |
| `keywords` | array | No | Keywords to search for items |
| `brandNames` | array | No | Brand names to filter by |
| `classificationIds` | array | No | Browse node IDs to filter by |
| `pageSize` | integer | No | Number of results per page (default: 10, max: 20) |
| `pageToken` | string | No | Token for pagination |
| `keywordsLocale` | string | No | Locale for keyword search |
| `locale` | string | No | Locale for response data |

#### Included Data Options
Use the `includedData` parameter to specify which data to include:
- `attributes` - Product attributes
- `classificationIds` - Browse node classifications
- `dimensions` - Product dimensions
- `identifiers` - Product identifiers
- `images` - Product images
- `productTypes` - Product type information
- `relationships` - Related products
- `salesRanks` - Sales ranking data
- `summaries` - Product summaries
- `vendorDetails` - Vendor-specific information

#### Example Request
```bash
GET /catalog/2022-04-01/items?marketplaceIds=ATVPDKIKX0DER&identifiers=B08N5WRWNW&includedData=attributes,images,summaries
```

### 2. Get Catalog Item
**Endpoint**: `GET /catalog/2022-04-01/items/{asin}`

Retrieve detailed information about a specific item by ASIN.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asin` | string | Yes | The Amazon Standard Identification Number |
| `marketplaceIds` | string | Yes | Comma-separated list of marketplace identifiers |
| `includedData` | array | No | Data types to include in response |
| `locale` | string | No | Locale for response data |

#### Example Request
```bash
GET /catalog/2022-04-01/items/B08N5WRWNW?marketplaceIds=ATVPDKIKX0DER&includedData=attributes,images,summaries,salesRanks
```

## Response Structure

### Item Object
```json
{
  "asin": "B08N5WRWNW",
  "attributes": {
    "brand": [{"value": "Apple", "marketplace_id": "ATVPDKIKX0DER"}],
    "bullet_point": [
      {"value": "5G speed. A14 Bionic chip", "marketplace_id": "ATVPDKIKX0DER"}
    ],
    "color": [{"value": "Blue", "marketplace_id": "ATVPDKIKX0DER"}],
    "item_name": [{"value": "Apple iPhone 12", "marketplace_id": "ATVPDKIKX0DER"}]
  },
  "dimensions": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "item": {
        "height": {"unit": "inches", "value": 5.78},
        "length": {"unit": "inches", "value": 2.82},
        "weight": {"unit": "pounds", "value": 0.36},
        "width": {"unit": "inches", "value": 0.29}
      }
    }
  ],
  "identifiers": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "identifiers": [
        {"identifier": "B08N5WRWNW", "identifierType": "ASIN"},
        {"identifier": "194252021224", "identifierType": "EAN"}
      ]
    }
  ],
  "images": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "images": [
        {
          "variant": "MAIN",
          "link": "https://m.media-amazon.com/images/I/71ZOtNdaZCL._AC_SL1500_.jpg",
          "height": 1500,
          "width": 940
        }
      ]
    }
  ],
  "productTypes": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "productType": "CELLULAR_PHONE"
    }
  ],
  "salesRanks": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "classificationRanks": [
        {
          "classificationId": "2335752011",
          "title": "Cell Phones & Accessories",
          "rank": 5
        }
      ]
    }
  ],
  "summaries": [
    {
      "marketplaceId": "ATVPDKIKX0DER",
      "brand": "Apple",
      "browseClassification": {
        "classificationId": "2335752011",
        "displayName": "Cell Phones & Accessories"
      },
      "itemName": "Apple iPhone 12, 64GB, Blue - Unlocked",
      "manufacturer": "Apple Computer"
    }
  ]
}
```

## Rate Limits

- **Burst**: 5 requests per second
- **Rate**: 0.2 requests per second (sustained)

## Marketplace IDs

| Marketplace | ID |
|-------------|-----|
| US | ATVPDKIKX0DER |
| UK | A1F83G8C2ARO7P |
| DE | A1PA6795UKMFR9 |
| FR | A13V1IB3VIYZZH |
| IT | APJ6JRA9NG5V4 |
| ES | A1RKKUPIHCS9HS |
| JP | A1VC38T7YXB528 |
| CA | A2EUQ1WTGCTBG2 |
| MX | A1AM78C64UM0Y8 |

## Error Handling

The API returns standard HTTP status codes and error responses:

```json
{
  "errors": [
    {
      "code": "InvalidInput",
      "message": "The provided ASIN is invalid",
      "details": "ASIN must be exactly 10 characters"
    }
  ]
}
```

Common error codes:
- `InvalidInput` - Invalid request parameters
- `Unauthorized` - Authentication failure
- `AccessDenied` - Insufficient permissions
- `NotFound` - Item not found
- `TooManyRequests` - Rate limit exceeded
- `InternalError` - Server error

## Best Practices

1. **Batch Requests**: Use the `identifiers` parameter to request up to 20 items in a single call
2. **Selective Data Retrieval**: Only request the `includedData` you need to minimize response size
3. **Implement Exponential Backoff**: Handle rate limiting gracefully
4. **Cache Responses**: Product data doesn't change frequently, implement appropriate caching
5. **Use Pagination**: When searching, implement proper pagination using `pageToken`
6. **Handle Missing Data**: Not all products have all data types available

## Integration Example (Node.js)

```javascript
const axios = require('axios');
const aws4 = require('aws4');

class AmazonCatalogAPI {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseURL = `https://sellingpartnerapi-${credentials.region}.amazon.com`;
  }

  async getCatalogItem(asin, marketplaceId, includedData = []) {
    const path = `/catalog/2022-04-01/items/${asin}`;
    const params = new URLSearchParams({
      marketplaceIds: marketplaceId,
      includedData: includedData.join(',')
    });

    const request = {
      host: `sellingpartnerapi-${this.credentials.region}.amazon.com`,
      method: 'GET',
      url: `${this.baseURL}${path}?${params}`,
      path: `${path}?${params}`,
      headers: {
        'x-amz-access-token': this.credentials.accessToken,
        'Content-Type': 'application/json'
      }
    };

    // Sign request with AWS4
    aws4.sign(request, this.credentials.aws);

    try {
      const response = await axios(request);
      return response.data;
    } catch (error) {
      console.error('API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchCatalogItems(params) {
    const path = '/catalog/2022-04-01/items';
    const queryParams = new URLSearchParams(params);

    const request = {
      host: `sellingpartnerapi-${this.credentials.region}.amazon.com`,
      method: 'GET',
      url: `${this.baseURL}${path}?${queryParams}`,
      path: `${path}?${queryParams}`,
      headers: {
        'x-amz-access-token': this.credentials.accessToken,
        'Content-Type': 'application/json'
      }
    };

    aws4.sign(request, this.credentials.aws);

    try {
      const response = await axios(request);
      return response.data;
    } catch (error) {
      console.error('API Error:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Usage example
const catalogAPI = new AmazonCatalogAPI({
  region: 'na',
  accessToken: 'your-access-token',
  aws: {
    accessKeyId: 'your-access-key',
    secretAccessKey: 'your-secret-key',
    sessionToken: 'your-session-token'
  }
});

// Get item details
const itemDetails = await catalogAPI.getCatalogItem(
  'B08N5WRWNW',
  'ATVPDKIKX0DER',
  ['attributes', 'images', 'summaries', 'salesRanks']
);

// Search for items
const searchResults = await catalogAPI.searchCatalogItems({
  marketplaceIds: 'ATVPDKIKX0DER',
  keywords: 'iPhone 12',
  pageSize: 20,
  includedData: 'summaries,images'
});
```

## Important Notes

1. **Access Requirements**: You must be approved for the Product Listing role to use this API
2. **Data Freshness**: Catalog data is updated regularly but may have slight delays
3. **Regional Differences**: Product availability and attributes vary by marketplace
4. **Vendor vs Seller**: Some data (like `vendorDetails`) is only available to vendors
5. **ASIN Validity**: ASINs are marketplace-specific; the same product may have different ASINs in different marketplaces

## Related APIs

- **Product Fees API**: Get fee estimates for products
- **Product Pricing API**: Get current pricing information
- **Listings API**: Manage your product listings
- **Reports API**: Generate catalog reports

## Support and Resources

- [SP-API Documentation](https://developer-docs.amazon.com/sp-api/)
- [Developer Forums](https://developer.amazonservices.com/forums/c/amazon-marketplace-web-service)
- [GitHub Examples](https://github.com/amzn/selling-partner-api-models)