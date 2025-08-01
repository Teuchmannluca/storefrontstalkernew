import aws4 from 'aws4'
import axios, { AxiosError } from 'axios'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'

interface SPAPIConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  roleArn: string
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

export class AmazonSPAPI {
  private config: SPAPIConfig
  private accessToken?: string
  private tokenExpiry?: Date
  private stsClient: STSClient

  constructor(config: SPAPIConfig) {
    this.config = config
    this.stsClient = new STSClient({ region: 'us-east-1' })
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
      const response = await axios.post('https://api.amazon.com/auth/o2/token', {
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      })

      this.accessToken = response.data.access_token
      // Set expiry to 50 minutes (tokens last 1 hour)
      this.tokenExpiry = new Date(Date.now() + 50 * 60 * 1000)
      
      return this.accessToken!
    } catch (error) {
      console.error('Error getting access token:', error)
      throw new Error('Failed to get Amazon access token')
    }
  }

  private async getSTSCredentials() {
    try {
      const command = new AssumeRoleCommand({
        RoleArn: this.config.roleArn,
        RoleSessionName: 'sp-api-session',
        DurationSeconds: 3600
      })

      const response = await this.stsClient.send(command)
      
      if (!response.Credentials) {
        throw new Error('No credentials returned from STS')
      }

      return {
        accessKeyId: response.Credentials.AccessKeyId!,
        secretAccessKey: response.Credentials.SecretAccessKey!,
        sessionToken: response.Credentials.SessionToken!
      }
    } catch (error) {
      console.error('Error getting STS credentials:', error)
      throw new Error('Failed to assume role for SP-API')
    }
  }

  async getCatalogItem(asin: string): Promise<CatalogItem | null> {
    try {
      const accessToken = await this.getAccessToken()
      const stsCredentials = await this.getSTSCredentials()
      
      const endpoint = this.getRegionEndpoint()
      const path = `/catalog/2022-04-01/items/${asin}`
      const params = new URLSearchParams({
        marketplaceIds: this.config.marketplaceId,
        includedData: 'attributes,images,salesRanks,summaries'
      })

      const request = {
        host: endpoint,
        method: 'GET',
        path: `${path}?${params}`,
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Storefront-Tracker/1.0'
        }
      }

      // Sign the request with AWS4
      const signedRequest = aws4.sign(request, {
        accessKeyId: stsCredentials.accessKeyId,
        secretAccessKey: stsCredentials.secretAccessKey,
        sessionToken: stsCredentials.sessionToken
      })

      const response = await axios({
        method: signedRequest.method as any,
        url: `https://${signedRequest.host}${signedRequest.path}`,
        headers: signedRequest.headers as any
      })

      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('SP-API Error:', error.response?.data || error.message)
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
      const stsCredentials = await this.getSTSCredentials()
      
      const endpoint = this.getRegionEndpoint()
      const path = '/catalog/2022-04-01/items'
      const params = new URLSearchParams({
        marketplaceIds: this.config.marketplaceId,
        identifiers: identifiers.join(','),
        identifiersType: 'ASIN',
        includedData: 'attributes,images,salesRanks,summaries'
      })

      const request = {
        host: endpoint,
        method: 'GET',
        path: `${path}?${params}`,
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Storefront-Tracker/1.0'
        }
      }

      const signedRequest = aws4.sign(request, {
        accessKeyId: stsCredentials.accessKeyId,
        secretAccessKey: stsCredentials.secretAccessKey,
        sessionToken: stsCredentials.sessionToken
      })

      const response = await axios({
        method: signedRequest.method as any,
        url: `https://${signedRequest.host}${signedRequest.path}`,
        headers: signedRequest.headers as any
      })

      return response.data.items || []
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('SP-API Error:', error.response?.data || error.message)
      }
      throw error
    }
  }

  // Helper method to extract the main image
  static extractMainImage(item: CatalogItem): string | null {
    if (!item.images || item.images.length === 0) return null
    
    const images = item.images[0].images
    const mainImage = images.find(img => img.variant === 'MAIN')
    
    return mainImage?.link || images[0]?.link || null
  }

  // Helper method to extract product name
  static extractProductName(item: CatalogItem): string {
    // Try summaries first (cleaner data)
    if (item.summaries && item.summaries.length > 0) {
      return item.summaries[0].itemName || 'Unknown Product'
    }
    
    // Fall back to attributes
    if (item.attributes?.item_name && item.attributes.item_name.length > 0) {
      return item.attributes.item_name[0].value
    }
    
    return 'Unknown Product'
  }

  // Helper method to extract brand
  static extractBrand(item: CatalogItem): string | null {
    // Try summaries first
    if (item.summaries && item.summaries.length > 0 && item.summaries[0].brand) {
      return item.summaries[0].brand
    }
    
    // Fall back to attributes
    if (item.attributes?.brand && item.attributes.brand.length > 0) {
      return item.attributes.brand[0].value
    }
    
    return null
  }

  // Helper method to extract primary sales rank
  static extractSalesRank(item: CatalogItem): number | null {
    if (!item.salesRanks || item.salesRanks.length === 0) return null
    
    const ranks = item.salesRanks[0].classificationRanks
    if (ranks.length === 0) return null
    
    // Return the first (primary) rank
    return ranks[0].rank
  }
}