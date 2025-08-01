import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

export interface SPAPICredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface SPAPIConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  roleArn?: string;
}

export interface ProductDetails {
  asin: string;
  title: string;
  brand: string;
  mainImage: string;
  salesRanks: Array<{
    rank: number;
    category: string;
  }>;
}

class SPAPIClient {
  private credentials: SPAPICredentials;
  private config: SPAPIConfig;
  private marketplaceId: string;
  private endpoint: string;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private stsClient: STSClient;
  private assumedCredentials: SPAPICredentials | null = null;

  constructor(credentials: SPAPICredentials, config: SPAPIConfig) {
    this.credentials = credentials;
    this.config = config;
    this.marketplaceId = config.marketplaceId;
    this.endpoint = 'sellingpartnerapi-eu.amazon.com';
    this.stsClient = new STSClient({ 
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      }
    });
  }

  private createCanonicalRequest(method: string, uri: string, queryString: string, headers: any, payload: string): string {
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(key => `${key.toLowerCase()}:${headers[key].trim()}`)
      .join('\n');
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    
    return [
      method,
      uri,
      queryString,
      canonicalHeaders,
      '',
      signedHeaders,
      hashedPayload
    ].join('\n');
  }

  private createStringToSign(algorithm: string, requestDateTime: string, credentialScope: string, canonicalRequest: string): string {
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    return [
      algorithm,
      requestDateTime,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
  }

  private calculateSignature(secretKey: string, dateStamp: string, region: string, service: string, stringToSign: string): string {
    const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }

  private signRequest(method: string, url: string, headers: any, payload: string = ''): any {
    const urlObj = new URL(url);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substr(0, 8);
    const region = this.credentials.region;
    const service = 'execute-api';
    const algorithm = 'AWS4-HMAC-SHA256';
    
    // Get the credentials to use (either original or assumed role credentials)
    const credsToUse = this.assumedCredentials || this.credentials;
    
    // Add required headers
    headers['host'] = urlObj.host;
    headers['x-amz-date'] = amzDate;
    if (credsToUse.sessionToken) {
      headers['x-amz-security-token'] = credsToUse.sessionToken;
    }
    
    const canonicalUri = urlObj.pathname;
    const canonicalQuerystring = urlObj.searchParams.toString();
    
    const canonicalRequest = this.createCanonicalRequest(
      method,
      canonicalUri,
      canonicalQuerystring,
      headers,
      payload
    );
    
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = this.createStringToSign(
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequest
    );
    
    const signature = this.calculateSignature(
      credsToUse.secretAccessKey,
      dateStamp,
      region,
      service,
      stringToSign
    );
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    headers['Authorization'] = `${algorithm} Credential=${credsToUse.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return headers;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // Get new access token using refresh token
    const tokenUrl = 'https://api.amazon.com/auth/o2/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    try {
      // Create custom HTTPS agent to handle SSL issues
      const httpsAgent = new https.Agent({
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        keepAlive: true,
      });

      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SP-API-Client/1.0',
        },
        httpsAgent,
        timeout: 10000,
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 1 hour from now (typical SP-API token lifetime)
      this.tokenExpiry = new Date(Date.now() + 3600 * 1000);
      return this.accessToken!;
    } catch (error: any) {
      console.error('Failed to get access token:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('Token error details:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error('Failed to authenticate with Amazon SP-API');
    }
  }

  private async assumeRole(): Promise<void> {
    if (!this.config.roleArn) {
      return; // No role to assume
    }

    try {
      const command = new AssumeRoleCommand({
        RoleArn: this.config.roleArn,
        RoleSessionName: `sp-api-session-${Date.now()}`,
        DurationSeconds: 3600,
      });

      const response = await this.stsClient.send(command);
      
      if (response.Credentials) {
        this.assumedCredentials = {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken!,
          region: this.credentials.region,
        };
      }
    } catch (error) {
      console.error('Failed to assume role:', error);
      // Continue with original credentials
    }
  }

  async getProductByASIN(asin: string): Promise<ProductDetails> {
    // Get access token first
    const accessToken = await this.getAccessToken();
    
    // Assume role if configured
    await this.assumeRole();
    
    const path = `/catalog/2022-04-01/items/${asin}`;
    const queryParams = new URLSearchParams({
      marketplaceIds: this.marketplaceId,
      includedData: 'attributes,images,salesRanks,summaries',
    });

    const url = `https://${this.endpoint}${path}?${queryParams.toString()}`;
    const method = 'GET';
    const headers = {
      'Content-Type': 'application/json',
      'x-amz-access-token': accessToken,
    };
    
    // Sign the request
    const signedHeaders = this.signRequest(method, url, headers);
    
    try {
      // Create custom HTTPS agent for API calls too
      const httpsAgent = new https.Agent({
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        keepAlive: true,
      });

      const response = await axios({
        method,
        url,
        headers: signedHeaders,
        httpsAgent,
        timeout: 10000,
      });

      const data = response.data;
      
      // Extract product details from SP-API response
      const attributes = data.attributes || {};
      const images = data.images || [];
      const salesRanks = data.salesRanks || [];
      const summaries = data.summaries || [];

      // Find main image
      const mainImage = images.find((img: any) => img.variant === 'MAIN')?.link || '';

      // Extract title and brand from summaries or attributes
      const marketplaceSummary = summaries.find((s: any) => s.marketplaceId === this.marketplaceId) || {};
      const title = marketplaceSummary.itemName || attributes.item_name?.[0]?.value || '';
      const brand = marketplaceSummary.brand || attributes.brand?.[0]?.value || '';

      // Extract sales ranks
      const formattedSalesRanks = salesRanks
        .filter((sr: any) => sr.marketplaceId === this.marketplaceId)
        .map((sr: any) => ({
          rank: sr.rank,
          category: sr.displayGroupRanks?.[0]?.title || 'Unknown Category',
        }));

      return {
        asin,
        title,
        brand,
        mainImage,
        salesRanks: formattedSalesRanks,
      };
    } catch (error: any) {
      console.error('SP-API Error:', error.response?.data || error.message);
      if (error.response?.status === 403) {
        console.error('403 Forbidden - Check IAM permissions and SP-API app roles');
      }
      throw new Error('Failed to fetch product details from Amazon SP-API');
    }
  }
}

export default SPAPIClient;