export interface Storefront {
  id: string;
  sellerId: string;
  sellerName: string;
  marketplace: string;
  productsCount?: number;
  lastSyncedAt?: Date;
  isActive: boolean;
  metadata?: {
    businessType?: string;
    rating?: number;
    reviewCount?: number;
  };
}