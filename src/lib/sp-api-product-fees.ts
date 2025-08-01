import crypto from 'crypto';
import axios from 'axios';

// Type definitions for Product Fees API
export interface FeesEstimateRequest {
  marketplaceId: string;
  priceToEstimateFees: PriceToEstimateFees;
  identifier: string;
  optionalFulfillmentProgram?: 'FBA_CORE' | 'FBA_SNL' | 'FBA_EFN';
}

export interface PriceToEstimateFees {
  listingPrice: MoneyType;
  shipping?: MoneyType;
  points?: Points;
}

export interface MoneyType {
  currencyCode: string;
  amount: number;
}

export interface Points {
  pointsNumber: number;
  pointsMonetaryValue: MoneyType;
}

export interface FeesEstimateResult {
  status: string;
  feesEstimateIdentifier: FeesEstimateIdentifier;
  feesEstimate?: FeesEstimate;
  error?: FeesEstimateError;
}

export interface FeesEstimateIdentifier {
  marketplaceId: string;
  sellerId: string;
  idType: 'ASIN' | 'SKU';
  idValue: string;
  isAmazonFulfilled?: boolean;
  priceToEstimateFees: PriceToEstimateFees;
  sellerInputIdentifier?: string;
  optionalFulfillmentProgram?: string;
}

export interface FeesEstimate {
  timeOfFeesEstimation: string;
  totalFeesEstimate?: MoneyType;
  feeDetailList?: FeeDetail[];
}

export interface FeeDetail {
  feeType: string;
  feeAmount: MoneyType;
  feePromotion?: MoneyType;
  taxAmount?: MoneyType;
  finalFee: MoneyType;
  includedFeeDetailList?: IncludedFeeDetail[];
}

export interface IncludedFeeDetail {
  feeType: string;
  feeAmount: MoneyType;
  feePromotion?: MoneyType;
  taxAmount?: MoneyType;
  finalFee: MoneyType;
}

export interface FeesEstimateError {
  type: string;
  code: string;
  message: string;
  detail: string;
}

export interface BatchFeesEstimateRequest {
  feesEstimateRequests: FeesEstimateRequest[];
}

// Rate limiter for Product Fees API
// The Product Fees API has a rate limit of 10 requests per second
class ProductFeesRateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 100; // 100ms between requests = 10 req/sec

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
    }
    
    const resolve = this.queue.shift();
    if (resolve) {
      this.lastRequestTime = Date.now();
      resolve();
    }
    
    this.processing = false;
    
    // Process next item in queue
    if (this.queue.length > 0) {
      setTimeout(() => this.process(), 0);
    }
  }
}

const productFeesRateLimiter = new ProductFeesRateLimiter();

export class SPAPIProductFeesClient {
  private credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
  };
  
  private config: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    marketplaceId: string;
    region: 'na' | 'eu' | 'fe';
  };
  
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  constructor(
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken?: string;
      region: string;
    },
    config: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      marketplaceId: string;
      region: 'na' | 'eu' | 'fe';
    }
  ) {
    this.credentials = credentials;
    this.config = config;
  }
  
  private getEndpoint(): string {
    const endpoints = {
      na: 'https://sellingpartnerapi-na.amazon.com',
      eu: 'https://sellingpartnerapi-eu.amazon.com',
      fe: 'https://sellingpartnerapi-fe.amazon.com'
    };
    return endpoints[this.config.region];
  }
  
  private getTokenEndpoint(): string {
    return 'https://api.amazon.com/auth/o2/token';
  }
  
  private async getAccessToken(): Promise<string> {
    const tokenUrl = this.getTokenEndpoint();
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });
    
    try {
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const { access_token, expires_in } = response.data;
      this.accessToken = access_token;
      this.tokenExpiry = new Date(Date.now() + (expires_in - 60) * 1000);
      
      return access_token;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to get access token');
    }
  }
  
  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry <= new Date()) {
      return await this.getAccessToken();
    }
    return this.accessToken;
  }
  
  private createCanonicalRequest(
    method: string,
    path: string,
    queryParams: string,
    headers: { [key: string]: string },
    payload: string
  ): string {
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
      path,
      queryParams,
      canonicalHeaders,
      '',
      signedHeaders,
      hashedPayload
    ].join('\n');
  }
  
  private createStringToSign(
    timestamp: string,
    region: string,
    service: string,
    canonicalRequest: string
  ): string {
    const date = timestamp.substring(0, 8);
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    
    return [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n');
  }
  
  private calculateSignature(
    secretKey: string,
    date: string,
    region: string,
    service: string,
    stringToSign: string
  ): string {
    const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    
    return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }
  
  private async makeRequest(
    method: string,
    path: string,
    queryParams: { [key: string]: string } = {},
    body: any = null
  ): Promise<any> {
    await productFeesRateLimiter.acquire();
    
    const accessToken = await this.ensureValidToken();
    const endpoint = this.getEndpoint();
    const url = new URL(path, endpoint);
    
    // Add query parameters
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substring(0, 8);
    const payload = body ? JSON.stringify(body) : '';
    
    const headers: { [key: string]: string } = {
      'host': url.hostname,
      'x-amz-access-token': accessToken,
      'x-amz-date': timestamp,
      'content-type': 'application/json',
      'user-agent': 'StorefrontTracker/1.0'
    };
    
    if (this.credentials.sessionToken) {
      headers['x-amz-security-token'] = this.credentials.sessionToken;
    }
    
    const canonicalRequest = this.createCanonicalRequest(
      method,
      url.pathname,
      url.search.substring(1),
      headers,
      payload
    );
    
    const stringToSign = this.createStringToSign(
      timestamp,
      this.credentials.region,
      'execute-api',
      canonicalRequest
    );
    
    const signature = this.calculateSignature(
      this.credentials.secretAccessKey,
      date,
      this.credentials.region,
      'execute-api',
      stringToSign
    );
    
    const signedHeaders = Object.keys(headers)
      .sort()
      .map(key => key.toLowerCase())
      .join(';');
    
    headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${this.credentials.accessKeyId}/${date}/${this.credentials.region}/execute-api/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    try {
      console.log(`Product Fees API Request: ${method} ${url.toString()}`);
      console.log('Request body:', body ? JSON.stringify(body, null, 2) : 'No body');
      
      const response = await axios({
        method,
        url: url.toString(),
        headers,
        ...(method !== 'GET' && body ? { data: body } : {})
      });
      
      console.log('Product Fees API Response Status:', response.status);
      console.log('Product Fees API Response Data:', JSON.stringify(response.data, null, 2));
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error('Product Fees API Error Status:', error.response.status);
        console.error('Product Fees API Error Data:', error.response.data);
        throw new Error(`SP-API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  /**
   * Get fees estimate for a single SKU
   */
  async getMyFeesEstimateForSKU(
    sku: string,
    priceToEstimateFees: PriceToEstimateFees,
    marketplaceId?: string,
    identifier?: string,
    optionalFulfillmentProgram?: 'FBA_CORE' | 'FBA_SNL' | 'FBA_EFN'
  ): Promise<FeesEstimateResult> {
    const body: any = {
      FeesEstimateRequest: {
        MarketplaceId: marketplaceId || this.config.marketplaceId,
        Identifier: identifier || `fees-estimate-sku-${sku}-${Date.now()}`,
        PriceToEstimateFees: {
          ListingPrice: {
            CurrencyCode: priceToEstimateFees.listingPrice.currencyCode,
            Amount: priceToEstimateFees.listingPrice.amount
          }
        }
      }
    };
    
    if (priceToEstimateFees.shipping) {
      body.FeesEstimateRequest.PriceToEstimateFees.Shipping = {
        CurrencyCode: priceToEstimateFees.shipping.currencyCode,
        Amount: priceToEstimateFees.shipping.amount
      };
    }
    
    if (priceToEstimateFees.points) {
      body.FeesEstimateRequest.PriceToEstimateFees.Points = {
        PointsNumber: priceToEstimateFees.points.pointsNumber,
        PointsMonetaryValue: {
          CurrencyCode: priceToEstimateFees.points.pointsMonetaryValue.currencyCode,
          Amount: priceToEstimateFees.points.pointsMonetaryValue.amount
        }
      };
    }
    
    
    if (optionalFulfillmentProgram) {
      body.FeesEstimateRequest.OptionalFulfillmentProgram = optionalFulfillmentProgram;
    }
    
    const response = await this.makeRequest(
      'POST',
      `/products/fees/v0/listings/${sku}/feesEstimate`,
      {},
      body
    );
    
    return this.transformFeesEstimateResponse(response.payload.FeesEstimateResult);
  }
  
  /**
   * Get fees estimate for a single ASIN
   */
  async getMyFeesEstimateForASIN(
    asin: string,
    priceToEstimateFees: PriceToEstimateFees,
    marketplaceId?: string,
    identifier?: string,
    optionalFulfillmentProgram?: 'FBA_CORE' | 'FBA_SNL' | 'FBA_EFN'
  ): Promise<FeesEstimateResult> {
    const body: any = {
      FeesEstimateRequest: {
        MarketplaceId: marketplaceId || this.config.marketplaceId,
        Identifier: identifier || `fees-estimate-asin-${asin}-${Date.now()}`,
        PriceToEstimateFees: {
          ListingPrice: {
            CurrencyCode: priceToEstimateFees.listingPrice.currencyCode,
            Amount: priceToEstimateFees.listingPrice.amount
          }
        }
      }
    };
    
    if (priceToEstimateFees.shipping) {
      body.FeesEstimateRequest.PriceToEstimateFees.Shipping = {
        CurrencyCode: priceToEstimateFees.shipping.currencyCode,
        Amount: priceToEstimateFees.shipping.amount
      };
    }
    
    if (priceToEstimateFees.points) {
      body.FeesEstimateRequest.PriceToEstimateFees.Points = {
        PointsNumber: priceToEstimateFees.points.pointsNumber,
        PointsMonetaryValue: {
          CurrencyCode: priceToEstimateFees.points.pointsMonetaryValue.currencyCode,
          Amount: priceToEstimateFees.points.pointsMonetaryValue.amount
        }
      };
    }
    
    
    if (optionalFulfillmentProgram) {
      body.FeesEstimateRequest.OptionalFulfillmentProgram = optionalFulfillmentProgram;
    }
    
    const response = await this.makeRequest(
      'POST',
      `/products/fees/v0/items/${asin}/feesEstimate`,
      {},
      body
    );
    
    return this.transformFeesEstimateResponse(response.payload.FeesEstimateResult);
  }
  
  /**
   * Get fees estimates for multiple products (batch operation)
   */
  async getMyFeesEstimates(
    feesEstimateRequests: Array<{
      idType: 'ASIN' | 'SKU';
      idValue: string;
      priceToEstimateFees: PriceToEstimateFees;
      marketplaceId?: string;
      identifier?: string;
      optionalFulfillmentProgram?: 'FBA_CORE' | 'FBA_SNL' | 'FBA_EFN';
    }>
  ): Promise<FeesEstimateResult[]> {
    const body = {
      FeesEstimateRequestList: feesEstimateRequests.map(request => ({
        IdType: request.idType,
        IdValue: request.idValue,
        FeesEstimateRequest: {
          MarketplaceId: request.marketplaceId || this.config.marketplaceId,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: request.priceToEstimateFees.listingPrice.currencyCode,
              Amount: request.priceToEstimateFees.listingPrice.amount
            },
            ...(request.priceToEstimateFees.shipping && {
              Shipping: {
                CurrencyCode: request.priceToEstimateFees.shipping.currencyCode,
                Amount: request.priceToEstimateFees.shipping.amount
              }
            }),
            ...(request.priceToEstimateFees.points && {
              Points: {
                PointsNumber: request.priceToEstimateFees.points.pointsNumber,
                PointsMonetaryValue: {
                  CurrencyCode: request.priceToEstimateFees.points.pointsMonetaryValue.currencyCode,
                  Amount: request.priceToEstimateFees.points.pointsMonetaryValue.amount
                }
              }
            })
          },
          ...(request.identifier && { Identifier: request.identifier }),
          ...(request.optionalFulfillmentProgram && { 
            OptionalFulfillmentProgram: request.optionalFulfillmentProgram 
          })
        }
      }))
    };
    
    const response = await this.makeRequest(
      'POST',
      '/products/fees/v0/feesEstimate',
      {},
      body
    );
    
    return response.payload.map((item: any) => this.transformFeesEstimateResponse(item));
  }
  
  /**
   * Transform API response to our interface
   */
  private transformFeesEstimateResponse(response: any): FeesEstimateResult {
    console.log('Transforming response:', JSON.stringify(response, null, 2));
    
    if (!response) {
      throw new Error('No response data to transform');
    }
    
    const result: FeesEstimateResult = {
      status: response.Status,
      feesEstimateIdentifier: {
        marketplaceId: response.FeesEstimateIdentifier?.MarketplaceId || '',
        sellerId: response.FeesEstimateIdentifier?.SellerId || '',
        idType: response.FeesEstimateIdentifier?.IdType || 'ASIN',
        idValue: response.FeesEstimateIdentifier?.IdValue || '',
        isAmazonFulfilled: response.FeesEstimateIdentifier?.IsAmazonFulfilled || false,
        priceToEstimateFees: {
          listingPrice: {
            currencyCode: response.FeesEstimateIdentifier?.PriceToEstimateFees?.ListingPrice?.CurrencyCode || 'GBP',
            amount: response.FeesEstimateIdentifier?.PriceToEstimateFees?.ListingPrice?.Amount || 0
          }
        }
      }
    };
    
    if (response.FeesEstimateIdentifier?.PriceToEstimateFees?.Shipping) {
      result.feesEstimateIdentifier.priceToEstimateFees.shipping = {
        currencyCode: response.FeesEstimateIdentifier.PriceToEstimateFees.Shipping.CurrencyCode,
        amount: response.FeesEstimateIdentifier.PriceToEstimateFees.Shipping.Amount
      };
    }
    
    if (response.FeesEstimateIdentifier?.SellerInputIdentifier) {
      result.feesEstimateIdentifier.sellerInputIdentifier = response.FeesEstimateIdentifier.SellerInputIdentifier;
    }
    
    if (response.FeesEstimateIdentifier?.OptionalFulfillmentProgram) {
      result.feesEstimateIdentifier.optionalFulfillmentProgram = response.FeesEstimateIdentifier.OptionalFulfillmentProgram;
    }
    
    if (response.FeesEstimate) {
      result.feesEstimate = {
        timeOfFeesEstimation: response.FeesEstimate.TimeOfFeesEstimation,
        totalFeesEstimate: response.FeesEstimate.TotalFeesEstimate && {
          currencyCode: response.FeesEstimate.TotalFeesEstimate.CurrencyCode,
          amount: response.FeesEstimate.TotalFeesEstimate.Amount
        },
        feeDetailList: response.FeesEstimate.FeeDetailList?.map((fee: any) => ({
          feeType: fee.FeeType,
          feeAmount: {
            currencyCode: fee.FeeAmount.CurrencyCode,
            amount: fee.FeeAmount.Amount
          },
          feePromotion: fee.FeePromotion && {
            currencyCode: fee.FeePromotion.CurrencyCode,
            amount: fee.FeePromotion.Amount
          },
          taxAmount: fee.TaxAmount && {
            currencyCode: fee.TaxAmount.CurrencyCode,
            amount: fee.TaxAmount.Amount
          },
          finalFee: {
            currencyCode: fee.FinalFee.CurrencyCode,
            amount: fee.FinalFee.Amount
          },
          includedFeeDetailList: fee.IncludedFeeDetailList?.map((includedFee: any) => ({
            feeType: includedFee.FeeType,
            feeAmount: {
              currencyCode: includedFee.FeeAmount.CurrencyCode,
              amount: includedFee.FeeAmount.Amount
            },
            feePromotion: includedFee.FeePromotion && {
              currencyCode: includedFee.FeePromotion.CurrencyCode,
              amount: includedFee.FeePromotion.Amount
            },
            taxAmount: includedFee.TaxAmount && {
              currencyCode: includedFee.TaxAmount.CurrencyCode,
              amount: includedFee.TaxAmount.Amount
            },
            finalFee: {
              currencyCode: includedFee.FinalFee.CurrencyCode,
              amount: includedFee.FinalFee.Amount
            }
          }))
        }))
      };
    }
    
    if (response.Error) {
      result.error = {
        type: response.Error.Type,
        code: response.Error.Code,
        message: response.Error.Message,
        detail: response.Error.Detail
      };
    }
    
    return result;
  }
}