import axios from 'axios'
import crypto from 'crypto'

interface SPAPIConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  region: 'na' | 'eu' | 'fe'
  marketplaceId: string
}

interface CatalogItem {
  asin: string
  attributes?: {
    item_name?: Array<{ value: string; marketplace_id: string }>
    brand?: Array<{ value: string; marketplace_id: string }>
  }
  images?: Array<{
    marketplaceId: string
    images: Array<{
      variant: string
      link: string
      height: number
      width: number
    }>
  }>
  salesRanks?: Array<{
    marketplaceId: string
    classificationRanks: Array<{
      classificationId: string
      title: string
      rank: number
    }>
  }>
  summaries?: Array<{
    marketplaceId: string
    brand?: string
    itemName?: string
  }>
}

export class AmazonSPAPISimple {
  private config: SPAPIConfig
  private accessToken?: string
  private tokenExpiry?: Date

  constructor(config: SPAPIConfig) {
    this.config = config
  }

  private getRegionEndpoint(): string {
    const endpoints = {
      na: 'sellingpartnerapi-na.amazon.com',
      eu: 'sellingpartnerapi-eu.amazon.com',
      fe: 'sellingpartnerapi-fe.amazon.com'
    }
    return endpoints[this.config.region]
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken
    }

    try {
      // Exchange refresh token for access token
      const response = await axios.post(
        'https://api.amazon.com/auth/o2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )

      this.accessToken = response.data.access_token
      // Set expiry to 50 minutes (tokens last 1 hour)
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000)
      
      // Access token obtained
      return this.accessToken!
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message)
      throw new Error('Failed to get Amazon access token')
    }
  }

  async getCatalogItem(asin: string, maxRetries: number = 3): Promise<CatalogItem | null> {
    const baseDelay = 1000 // 1 second base delay
    let lastError: any

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const accessToken = await this.getAccessToken()
        
        const endpoint = this.getRegionEndpoint()
        const path = `/catalog/2022-04-01/items/${asin}`
        const params = new URLSearchParams({
          marketplaceIds: this.config.marketplaceId,
          includedData: 'attributes,images,salesRanks,summaries'
        })

        const url = `https://${endpoint}${path}?${params}`
        if (attempt === 0) {
          console.log('Calling SP-API:', url)
        }

        const response = await axios({
          method: 'GET',
          url,
          headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'User-Agent': 'Storefront-Tracker/1.0',
            'Connection': 'keep-alive'
          },
          timeout: 30000, // 30 second timeout
          // Connection pool settings for better stability
          httpsAgent: new (require('https').Agent)({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 30000,
            freeSocketTimeout: 15000,
          })
        })

        return response.data
        
      } catch (error: any) {
        lastError = error
        
        if (axios.isAxiosError(error)) {
          const status = error.response?.status
          const code = error.code
          
          // Don't retry for these permanent errors
          if (status === 404) {
            return null // Item not found
          }
          if (status === 403) {
            console.error('SP-API Access Denied - check credentials and permissions')
            throw error
          }
          if (status === 401) {
            console.error('SP-API Authentication failed - refreshing token')
            this.accessToken = undefined // Force token refresh
            this.tokenExpiry = undefined
          }
          
          // Retry for these temporary errors
          const shouldRetry = (
            code === 'ECONNRESET' || 
            code === 'ETIMEDOUT' || 
            code === 'ENOTFOUND' ||
            code === 'ECONNREFUSED' ||
            status === 429 || // Rate limited
            status === 500 || // Internal server error
            status === 502 || // Bad gateway
            status === 503 || // Service unavailable
            status === 504    // Gateway timeout
          )
          
          if (!shouldRetry || attempt === maxRetries) {
            console.error(`SP-API Error (final attempt ${attempt + 1}/${maxRetries + 1}):`, 
              status || code, error.response?.data || error.message)
            throw error
          }
          
          // Calculate exponential backoff delay
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
          console.warn(`SP-API Error (attempt ${attempt + 1}/${maxRetries + 1}) for ASIN ${asin}:`, 
            status || code, error.message, `- retrying in ${Math.round(delay)}ms`)
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // Non-axios error, don't retry
          console.error('Non-HTTP error fetching catalog item:', error)
          throw error
        }
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw lastError
  }

  async searchCatalogItems(identifiers: string[], maxRetries: number = 3): Promise<CatalogItem[]> {
    const baseDelay = 1000 // 1 second base delay
    let lastError: any

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const accessToken = await this.getAccessToken()
        
        const endpoint = this.getRegionEndpoint()
        const path = '/catalog/2022-04-01/items'
        const params = new URLSearchParams({
          marketplaceIds: this.config.marketplaceId,
          identifiers: identifiers.join(','),
          identifiersType: 'ASIN',
          includedData: 'attributes,images,salesRanks,summaries'
        })

        const url = `https://${endpoint}${path}?${params}`

        const response = await axios({
          method: 'GET',
          url,
          headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json',
            'User-Agent': 'Storefront-Tracker/1.0',
            'Connection': 'keep-alive'
          },
          timeout: 30000, // 30 second timeout
          // Connection pool settings for better stability
          httpsAgent: new (require('https').Agent)({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 30000,
            freeSocketTimeout: 15000,
          })
        })

        return response.data.items || []
        
      } catch (error: any) {
        lastError = error
        
        if (axios.isAxiosError(error)) {
          const status = error.response?.status
          const code = error.code
          
          // Don't retry for these permanent errors
          if (status === 403) {
            console.error('SP-API Access Denied - check credentials and permissions')
            throw error
          }
          if (status === 401) {
            console.error('SP-API Authentication failed - refreshing token')
            this.accessToken = undefined // Force token refresh
            this.tokenExpiry = undefined
          }
          
          // Retry for these temporary errors
          const shouldRetry = (
            code === 'ECONNRESET' || 
            code === 'ETIMEDOUT' || 
            code === 'ENOTFOUND' ||
            code === 'ECONNREFUSED' ||
            status === 429 || // Rate limited
            status === 500 || // Internal server error
            status === 502 || // Bad gateway
            status === 503 || // Service unavailable
            status === 504    // Gateway timeout
          )
          
          if (!shouldRetry || attempt === maxRetries) {
            console.error(`SP-API Search Error (final attempt ${attempt + 1}/${maxRetries + 1}):`, 
              status || code, error.response?.data || error.message)
            throw error
          }
          
          // Calculate exponential backoff delay
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
          console.warn(`SP-API Search Error (attempt ${attempt + 1}/${maxRetries + 1}):`, 
            status || code, error.message, `- retrying in ${Math.round(delay)}ms`)
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // Non-axios error, don't retry
          console.error('Non-HTTP error searching catalog items:', error)
          throw error
        }
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw lastError
  }

  // Helper methods remain the same
  static extractMainImage(item: CatalogItem): string | null {
    if (!item.images || item.images.length === 0) return null
    
    const images = item.images[0].images
    const mainImage = images.find(img => img.variant === 'MAIN')
    
    return mainImage?.link || images[0]?.link || null
  }

  static extractProductName(item: CatalogItem): string {
    if (item.summaries && item.summaries.length > 0) {
      return item.summaries[0].itemName || 'Unknown Product'
    }
    
    if (item.attributes?.item_name && item.attributes.item_name.length > 0) {
      return item.attributes.item_name[0].value
    }
    
    return 'Unknown Product'
  }

  static extractBrand(item: CatalogItem): string | null {
    if (item.summaries && item.summaries.length > 0 && item.summaries[0].brand) {
      return item.summaries[0].brand
    }
    
    if (item.attributes?.brand && item.attributes.brand.length > 0) {
      return item.attributes.brand[0].value
    }
    
    return null
  }

  static extractSalesRank(item: CatalogItem): number | null {
    if (!item.salesRanks || item.salesRanks.length === 0) return null
    
    const ranks = item.salesRanks[0].classificationRanks
    if (ranks.length === 0) return null
    
    return ranks[0].rank
  }
}