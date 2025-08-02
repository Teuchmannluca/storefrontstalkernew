/**
 * Amazon Marketplace configuration
 */
export const MARKETPLACES = {
  UK: { 
    id: 'A1F83G8C2ARO7P', 
    currency: 'GBP', 
    region: 'eu' as const,
    name: 'United Kingdom' 
  },
  DE: { 
    id: 'A1PA6795UKMFR9', 
    currency: 'EUR', 
    region: 'eu' as const,
    name: 'Germany' 
  },
  FR: { 
    id: 'A13V1IB3VIYZZH', 
    currency: 'EUR', 
    region: 'eu' as const,
    name: 'France' 
  },
  IT: { 
    id: 'APJ6JRA9NG5V4', 
    currency: 'EUR', 
    region: 'eu' as const,
    name: 'Italy' 
  },
  ES: { 
    id: 'A1RKKUPIHCS9HS', 
    currency: 'EUR', 
    region: 'eu' as const,
    name: 'Spain' 
  }
} as const;

export type MarketplaceCode = keyof typeof MARKETPLACES;
export type MarketplaceInfo = typeof MARKETPLACES[MarketplaceCode];