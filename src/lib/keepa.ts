// Keepa API client for fetching seller products
export interface KeepaProduct {
  asin: string
  title: string
  brand?: string
  imagesCSV?: string
  salesRanks?: {
    [key: string]: number
  }
  stats?: {
    current?: number[]
    avg30?: number[]
    avg90?: number[]
  }
}

export interface KeepaSellerResponse {
  seller: {
    sellerId: string
    sellerName: string
    totalStorefrontAsins?: number
  }
  asinList?: string[]
  products?: KeepaProduct[]
}

export class KeepaClient {
  private apiKey: string
  private baseUrl = 'https://api.keepa.com'
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async getSellerProducts(sellerId: string, domain: number = 2): Promise<KeepaSellerResponse> {
    const url = `${this.baseUrl}/seller?key=${this.apiKey}&domain=${domain}&seller=${sellerId}&storefront=1`
    
    console.log('Keepa API URL:', url.replace(this.apiKey, 'HIDDEN'))
    
    try {
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Keepa API error response:', errorText)
        throw new Error(`Keepa API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('Keepa API response:', {
        seller: data.seller,
        asinListLength: data.asinList?.length,
        tokensLeft: data.tokensLeft,
        timestamp: data.timestamp
      })
      
      return data
    } catch (error) {
      console.error('Error fetching seller products from Keepa:', error)
      throw error
    }
  }

  async getProductDetails(asins: string[], domain: number = 2): Promise<KeepaProduct[]> {
    // Keepa allows up to 100 ASINs per request
    const batchSize = 100
    const products: KeepaProduct[] = []
    
    for (let i = 0; i < asins.length; i += batchSize) {
      const batch = asins.slice(i, i + batchSize)
      const asinParam = batch.join(',')
      const url = `${this.baseUrl}/product?key=${this.apiKey}&domain=${domain}&asin=${asinParam}&stats=1&offers=20`
      
      try {
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Keepa API error: ${response.status} ${response.statusText}`)
        }
        
        const data = await response.json()
        if (data.products) {
          products.push(...data.products)
        }
        
        // Respect rate limits (Keepa usually has rate limits)
        if (i + batchSize < asins.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      } catch (error) {
        console.error('Error fetching product details from Keepa:', error)
        throw error
      }
    }
    
    return products
  }

  // Helper to extract the main image from Keepa's CSV format
  static extractMainImage(imagesCSV?: string): string | null {
    if (!imagesCSV) return null
    const images = imagesCSV.split(',')
    return images[0] || null
  }

  // Helper to get current price from Keepa stats
  static getCurrentPrice(stats?: any): number | null {
    if (!stats?.current || !Array.isArray(stats.current)) return null
    // Index 1 is usually Amazon price, index 11 is New 3rd Party
    const price = stats.current[1] || stats.current[11]
    return price ? price / 100 : null // Keepa stores prices in cents
  }

  // Helper to get sales rank
  static getCurrentSalesRank(product: KeepaProduct): number | null {
    if (!product.salesRanks) return null
    // Get the main category sales rank
    const mainRank = Object.values(product.salesRanks)[0]
    return mainRank || null
  }
}