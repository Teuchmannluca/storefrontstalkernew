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

  async getCatalogItem(asin: string): Promise<CatalogItem | null> {
    try {
      const accessToken = await this.getAccessToken()
      
      const endpoint = this.getRegionEndpoint()
      const path = `/catalog/2022-04-01/items/${asin}`
      const params = new URLSearchParams({
        marketplaceIds: this.config.marketplaceId,
        includedData: 'attributes,images,salesRanks,summaries'
      })

      const url = `https://${endpoint}${path}?${params}`
      console.log('Calling SP-API:', url)

      const response = await axios({
        method: 'GET',
        url,
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Storefront-Tracker/1.0'
        }
      })

      return response.data
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('SP-API Error:', error.response?.status, error.response?.data || error.message)
        if (error.response?.status === 404) {
          return null // Item not found
        }
      }
      throw error
    }
  }

  async searchCatalogItems(identifiers: string[]): Promise<CatalogItem[]> {
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
          'User-Agent': 'Storefront-Tracker/1.0'
        }
      })

      return response.data.items || []
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('SP-API Error:', error.response?.data || error.message)
      }
      throw error
    }
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