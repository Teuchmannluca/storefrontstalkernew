import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
import { checkEnvVars } from '@/lib/env-check';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { ValidationError } from '@/lib/validation';
import { AppError } from '@/lib/error-handling';
import { BlacklistService } from '@/lib/blacklist-service';
import { calculateB2BProfit } from '@/lib/b2b-profit-calculator';
import { estimateMonthlySalesFromRank } from '@/lib/sales-estimator';
import { KeepaProductService } from '@/services/keepa-product-service';

// UK Marketplace configuration
const UK_MARKETPLACE = {
  id: 'A1F83G8C2ARO7P',
  currency: 'GBP',
  region: 'eu' as const
};

// Rate Limits Configuration - REDUCED for B2B to avoid quota issues
const RATE_LIMITS = {
  COMPETITIVE_PRICING: {
    requestsPerSecond: 0.2,  // Reduced from 0.5 to 0.2 (1 request every 5 seconds)
    itemsPerRequest: 10,     // Reduced from 20 to 10 ASINs per batch
    minInterval: 5000        // Increased from 2000ms to 5000ms between requests
  },
  PRODUCT_FEES: {
    requestsPerSecond: 0.5,  // Reduced from 1 to 0.5
    minInterval: 2000        // Increased from 1000ms to 2000ms
  },
  CATALOG: {
    requestsPerSecond: 1,    // Reduced from 2 to 1
    minInterval: 1000        // Increased from 500ms to 1000ms
  }
};

// Simple rate limiter
class RateLimiter {
  private lastRequestTime: Map<string, number> = new Map();
  
  async throttle(key: string, minInterval: number): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(key) || 0;
    const timeSinceLastRequest = now - lastTime;
    
    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }
    
    this.lastRequestTime.set(key, Date.now());
  }
}

interface StreamMessage {
  type: 'progress' | 'opportunity' | 'complete' | 'error';
  data: any;
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Validate request body
    const body = await request.json();
    if (!body.asins || !Array.isArray(body.asins) || body.asins.length === 0) {
      throw new ValidationError('ASINs array is required', 'asins');
    }
    
    const asins = body.asins;
    const isVatRegistered = body.isVatRegistered || false;

    // Check required environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      aws: { accessKeyId: true, secretAccessKey: true },
      amazon: { accessKeyId: true, secretAccessKey: true, refreshToken: true, marketplaceId: true }
    });

    if (!envCheck.success) {
      throw new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Validate ASINs
    const validASINs = asins.filter((asin: string) => /^[A-Z0-9]{10}$/i.test(asin)).map((a: string) => a.toUpperCase());
    if (validASINs.length === 0) {
      throw new ValidationError('No valid ASINs provided', 'asins');
    }

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;
        
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          isControllerClosed = true;
          originalClose();
        };

        const sendMessage = (message: StreamMessage) => {
          if (!isControllerClosed) {
            try {
              const data = `data: ${JSON.stringify(message)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            } catch (error) {
              console.log('[STREAM] Controller is closed, skipping message:', message.type);
            }
          }
        };

        let scanId: string | null = null;
        const rateLimiter = new RateLimiter();

        // Helper function to update scan progress
        const updateScanProgress = async (progress: number, step: string, processedCount: number = 0) => {
          if (!scanId) return;
          try {
            await supabase
              .from('arbitrage_scans')
              .update({
                progress_percentage: Math.min(100, Math.round(progress)),
                current_step: step,
                processed_count: processedCount,
                last_updated: new Date().toISOString()
              })
              .eq('id', scanId);
          } catch (error) {
            console.error('Failed to update scan progress:', error);
          }
        };

        try {
          sendMessage({ type: 'progress', data: { step: 'Initializing B2B arbitrage scan...', progress: 0 } });

          // Create scan record
          const { data: scan, error: scanError } = await supabase
            .from('arbitrage_scans')
            .insert({
              user_id: user.id,
              scan_type: 'b2b_arbitrage',
              storefront_name: 'B2B Arbitrage Checker',
              status: 'running',
              metadata: {
                asins_count: validASINs.length,
                is_vat_registered: isVatRegistered
              }
            })
            .select()
            .single();

          if (scanError || !scan) {
            sendMessage({ type: 'error', data: { error: 'Failed to create scan record' } });
            return;
          }

          scanId = scan.id;

          // Initialize SP-API clients
          const credentials = {
            accessKeyId: envCheck.values.awsAccessKeyId,
            secretAccessKey: envCheck.values.awsSecretAccessKey,
            sessionToken: undefined,
            region: envCheck.values.awsRegion || 'eu-west-1',
          };
          
          const spApiConfig = {
            clientId: envCheck.values.amazonAccessKeyId,
            clientSecret: envCheck.values.amazonSecretAccessKey,
            refreshToken: envCheck.values.amazonRefreshToken,
            marketplaceId: UK_MARKETPLACE.id,
            region: 'eu' as const,
          };

          const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
          const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);
          const catalogClient = new SPAPICatalogClient(credentials, spApiConfig);
          
          // Initialize Keepa service if API key is available
          let keepaService: KeepaProductService | null = null;
          const keepaApiKey = process.env.KEEPA_API_KEY;
          if (keepaApiKey) {
            console.log('[KEEPA] API key found, initializing service for B2B arbitrage');
            keepaService = new KeepaProductService(keepaApiKey, user.id, 2); // UK domain
          }

          // Initialize blacklist service
          const blacklistService = new BlacklistService(
            envCheck.values.supabaseUrl,
            envCheck.values.supabaseServiceKey
          );
          
          const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
          const { filteredProducts, excludedCount } = blacklistService.filterBlacklistedProducts(
            validASINs.map((asin: string) => ({ asin })),
            blacklistedAsins
          );

          const finalAsins = filteredProducts.map(p => p.asin);
          
          if (excludedCount > 0) {
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Excluded ${excludedCount} blacklisted ASINs. Processing ${finalAsins.length} ASINs...`, 
                progress: 5,
                scanId
              } 
            });
          }

          // Process in batches
          const batchSize = RATE_LIMITS.COMPETITIVE_PRICING.itemsPerRequest;
          let totalProcessed = 0;
          let opportunitiesFound = 0;
          const allOpportunities: any[] = [];

          for (let batchStart = 0; batchStart < finalAsins.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, finalAsins.length);
            const batchAsins = finalAsins.slice(batchStart, batchEnd);
            const batchNumber = Math.floor(batchStart / batchSize) + 1;
            const totalBatches = Math.ceil(finalAsins.length / batchSize);
            
            // Update progress for this batch
            const batchProgress = (batchStart / finalAsins.length) * 100;
            const progressMessage = `Processing batch ${batchNumber}/${totalBatches} (ASINs ${batchStart + 1}-${batchEnd} of ${finalAsins.length})`;
            
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: progressMessage,
                progress: batchProgress,
                scanId,
                processedCount: totalProcessed,
                totalAsins: finalAsins.length
              } 
            });
            
            await updateScanProgress(batchProgress, progressMessage, totalProcessed);

            try {
              // CRITICAL: Fetch B2B and B2C pricing SEQUENTIALLY to avoid quota issues
              // Add delay between B2B and B2C requests
              await rateLimiter.throttle('pricing-batch', RATE_LIMITS.COMPETITIVE_PRICING.minInterval);
              
              let b2bPricingBatch, b2cPricingBatch;
              let retryCount = 0;
              const maxRetries = 3;
              
              // Fetch B2B prices with retry logic
              while (retryCount < maxRetries) {
                try {
                  console.log(`Fetching B2B prices for batch ${batchNumber}, attempt ${retryCount + 1}`);
                  b2bPricingBatch = await pricingClient.getCompetitivePricing(
                    batchAsins,
                    UK_MARKETPLACE.id,
                    'Asin',
                    'Business' // B2B pricing
                  );
                  break; // Success, exit retry loop
                } catch (error: any) {
                  if (error.message?.includes('quota') && retryCount < maxRetries - 1) {
                    retryCount++;
                    const backoffDelay = Math.min(10000 * Math.pow(2, retryCount), 60000); // Exponential backoff
                    console.log(`B2B pricing quota error, retrying in ${backoffDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                  } else {
                    throw error;
                  }
                }
              }

              // Add delay between B2B and B2C requests
              await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
              
              // Fetch B2C prices with retry logic
              retryCount = 0;
              while (retryCount < maxRetries) {
                try {
                  console.log(`Fetching B2C prices for batch ${batchNumber}, attempt ${retryCount + 1}`);
                  b2cPricingBatch = await pricingClient.getCompetitivePricing(
                    batchAsins,
                    UK_MARKETPLACE.id,
                    'Asin',
                    'Consumer' // B2C pricing
                  );
                  break; // Success, exit retry loop
                } catch (error: any) {
                  if (error.message?.includes('quota') && retryCount < maxRetries - 1) {
                    retryCount++;
                    const backoffDelay = Math.min(10000 * Math.pow(2, retryCount), 60000); // Exponential backoff
                    console.log(`B2C pricing quota error, retrying in ${backoffDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                  } else {
                    throw error;
                  }
                }
              }
              
              if (!b2bPricingBatch || !b2cPricingBatch) {
                console.error('Failed to fetch pricing data after retries');
                continue;
              }

              // Parse B2B pricing - Look for ALL prices including quantity tiers
              const b2bPricingMap = new Map<string, any>();
              for (const product of b2bPricingBatch) {
                if (product.asin) {
                  const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || [];
                  
                  // Log the B2B response to understand structure
                  if (competitivePrices.length > 0) {
                    console.log(`B2B Pricing for ${product.asin}:`, JSON.stringify(competitivePrices, null, 2));
                  }
                  
                  // Filter for new condition B2B prices
                  const newConditionPrices = competitivePrices.filter(
                    (cp: any) => (cp.condition === 'New' || !cp.condition) && cp.offerType !== 'B2C'
                  );
                  
                  // Find the LOWEST price among all B2B offers (including quantity tiers)
                  let lowestPrice = null;
                  let lowestPriceData = null;
                  let quantityTiers = [];
                  
                  for (const priceData of newConditionPrices) {
                    if (priceData?.Price) {
                      const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                      if (listingPrice?.Amount) {
                        const price = listingPrice.Amount;
                        
                        // Track quantity tier if present
                        if (priceData.quantityTier) {
                          quantityTiers.push({
                            quantity: priceData.quantityTier,
                            price: price,
                            discount: priceData.quantityDiscountType
                          });
                        }
                        
                        // Update lowest price
                        if (lowestPrice === null || price < lowestPrice) {
                          lowestPrice = price;
                          lowestPriceData = priceData;
                        }
                      }
                    }
                  }
                  
                  // Store the lowest B2B price
                  if (lowestPrice !== null) {
                    b2bPricingMap.set(product.asin, {
                      price: lowestPrice,
                      standardPrice: newConditionPrices[0]?.Price?.ListingPrice?.Amount || lowestPrice, // Keep standard price too
                      currency: lowestPriceData.Price.ListingPrice?.CurrencyCode || 'GBP',
                      offerType: lowestPriceData.offerType || 'B2B',
                      quantityTier: lowestPriceData.quantityTier || 1,
                      quantityTiers: quantityTiers.length > 0 ? quantityTiers : null,
                      numberOfOffers: (product.competitivePricing as any)?.NumberOfOfferListings?.find(
                        (l: any) => l.condition === 'New'
                      )?.Count || 0,
                      salesRankings: product.salesRankings
                    });
                    
                    console.log(`B2B Lowest price for ${product.asin}: £${(lowestPrice / 1.20).toFixed(2)} ex-VAT (£${lowestPrice.toFixed(2)} inc-VAT) at quantity ${lowestPriceData.quantityTier || 1}`);
                  }
                }
              }

              // Parse B2C pricing
              const b2cPricingMap = new Map<string, any>();
              for (const product of b2cPricingBatch) {
                if (product.asin) {
                  const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || [];
                  const newConditionPrices = competitivePrices.filter(
                    (cp: any) => cp.condition === 'New' || !cp.condition
                  );
                  
                  if (newConditionPrices.length > 0) {
                    const priceData = newConditionPrices[0];
                    if (priceData?.Price) {
                      const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                      if (listingPrice?.Amount) {
                        b2cPricingMap.set(product.asin, {
                          price: listingPrice.Amount,
                          currency: listingPrice.CurrencyCode,
                          offerType: priceData.offerType || 'B2C',
                          numberOfOffers: (product.competitivePricing as any)?.NumberOfOfferListings?.find(
                            (l: any) => l.condition === 'New'
                          )?.Count || 0,
                          salesRankings: product.salesRankings
                        });
                      }
                    }
                  }
                }
              }

              // Analyze each ASIN in this batch
              for (const asin of batchAsins) {
                const b2bPricing = b2bPricingMap.get(asin);
                const b2cPricing = b2cPricingMap.get(asin);
                
                // Skip if we don't have both prices
                if (!b2bPricing?.price || !b2cPricing?.price) {
                  totalProcessed++;
                  console.log(`Skipping ${asin}: B2B price: ${b2bPricing?.price}, B2C price: ${b2cPricing?.price}`);
                  continue;
                }

                // Only process if B2B price is lower than B2C (potential arbitrage)
                if (b2bPricing.price >= b2cPricing.price) {
                  totalProcessed++;
                  console.log(`No arbitrage for ${asin}: B2B ${b2bPricing.price} >= B2C ${b2cPricing.price}`);
                  continue;
                }

                try {
                  // Get catalog data
                  let productName = asin;
                  let productImage = '';
                  let salesRank = 0;
                  
                  try {
                    await rateLimiter.throttle('catalog', RATE_LIMITS.CATALOG.minInterval);
                    
                    const catalogData = await catalogClient.getCatalogItem(
                      asin,
                      [UK_MARKETPLACE.id],
                      ['attributes', 'images', 'salesRanks', 'summaries']
                    );
                    
                    // Get product title
                    if (catalogData?.attributes?.title?.[0]?.value) {
                      productName = catalogData.attributes.title[0].value;
                    } else if (catalogData?.summaries?.[0]?.itemName) {
                      productName = catalogData.summaries[0].itemName;
                    }
                    
                    // Get product image
                    if (catalogData?.images?.[0]?.images?.[0]?.link) {
                      productImage = catalogData.images[0].images[0].link;
                    }
                    
                    // Get sales rank
                    if (catalogData?.salesRanks?.[0]?.ranks?.[0]?.rank) {
                      salesRank = catalogData.salesRanks[0].ranks[0].rank;
                    } else if (b2cPricing.salesRankings?.[0]?.Rank) {
                      salesRank = b2cPricing.salesRankings[0].Rank;
                    }
                  } catch (catalogError) {
                    console.error(`Catalog error for ${asin}:`, catalogError);
                  }

                  // Get fees from SP-API
                  let referralFee = 0;
                  let fbaFee = 0;
                  
                  try {
                    await rateLimiter.throttle('fees', RATE_LIMITS.PRODUCT_FEES.minInterval);
                    
                    const feesData = await feesClient.getMyFeesEstimateForASIN(
                      asin,
                      {
                        listingPrice: {
                          currencyCode: UK_MARKETPLACE.currency,
                          amount: b2cPricing.price // Fees calculated on selling price (B2C)
                        }
                      },
                      UK_MARKETPLACE.id,
                      undefined,
                      true // isAmazonFulfilled
                    );
                    
                    if (feesData?.feesEstimate?.totalFeesEstimate?.amount) {
                      const totalFees = feesData.feesEstimate.totalFeesEstimate.amount;
                      
                      // Extract specific fees if available
                      const feeDetails = feesData.feesEstimate.feeDetailList || [];
                      for (const fee of feeDetails) {
                        if (fee.feeType === 'ReferralFee') {
                          referralFee = fee.feeAmount?.amount || 0;
                        } else if (fee.feeType === 'FBAFees' || fee.feeType === 'FulfillmentFee') {
                          fbaFee += fee.feeAmount?.amount || 0;
                        }
                      }
                      
                      // If specific fees not found, use defaults
                      if (referralFee === 0) {
                        referralFee = b2cPricing.price * 0.15; // 15% default
                      }
                      if (fbaFee === 0) {
                        fbaFee = 3.00; // £3 default
                      }
                    } else {
                      // Use default fees if API doesn't return
                      referralFee = b2cPricing.price * 0.15;
                      fbaFee = 3.00;
                    }
                  } catch (feesError) {
                    console.error(`Fees error for ${asin}:`, feesError);
                    // Use default fees
                    referralFee = b2cPricing.price * 0.15;
                    fbaFee = 3.00;
                  }

                  // Calculate B2B to B2C profit
                  const profitCalc = calculateB2BProfit({
                    b2bPrice: b2bPricing.price,
                    b2cPrice: b2cPricing.price,
                    referralFee,
                    fbaFee,
                    isVatRegistered
                  });

                  // Estimate monthly sales
                  let salesPerMonth = 0;
                  if (salesRank > 0) {
                    salesPerMonth = estimateMonthlySalesFromRank(salesRank);
                  }

                  // Get Keepa data if available
                  let keepaSalesData = null;
                  if (keepaService) {
                    try {
                      const keepaData = await keepaService.enrichProduct(asin, false);
                      if (keepaData) {
                        keepaSalesData = keepaData;
                      }
                    } catch (keepaError) {
                      console.error(`Keepa error for ${asin}:`, keepaError);
                    }
                  }

                  // Create opportunity object with quantity tier info
                  const opportunity = {
                    asin,
                    productName,
                    productImage,
                    ukB2bPrice: profitCalc.ukB2bPrice,
                    ukB2bStandardPrice: b2bPricing.standardPrice, // Standard B2B price (quantity 1)
                    ukB2cPrice: profitCalc.ukB2cPrice,
                    priceDifference: profitCalc.priceDifference,
                    discountPercentage: profitCalc.discountPercentage,
                    amazonFees: profitCalc.amazonFees,
                    referralFee: profitCalc.referralFee,
                    fbaFee: profitCalc.fbaFee,
                    vatAmount: profitCalc.vatAmount,
                    netRevenue: profitCalc.netRevenue,
                    netProfit: profitCalc.netProfit,
                    roiPercentage: profitCalc.roiPercentage,
                    profitMargin: profitCalc.profitMargin,
                    profitCategory: profitCalc.profitCategory,
                    quantityForLowestPrice: b2bPricing.quantityTier || 1,
                    quantityTiers: b2bPricing.quantityTiers,
                    ukSalesRank: salesRank,
                    salesPerMonth,
                    competitorsCount: b2cPricing.numberOfOffers || 0,
                    keepaSalesData
                  };

                  // Save to database
                  await supabase
                    .from('b2b_arbitrage_opportunities')
                    .insert({
                      user_id: user.id,
                      scan_id: scanId,
                      asin,
                      product_name: productName,
                      product_image: productImage,
                      uk_b2b_price: profitCalc.ukB2bPrice,
                      uk_b2c_price: profitCalc.ukB2cPrice,
                      discount_percentage: profitCalc.discountPercentage,
                      amazon_fees: profitCalc.amazonFees,
                      referral_fee: profitCalc.referralFee,
                      fba_fee: profitCalc.fbaFee,
                      vat_amount: profitCalc.vatAmount,
                      net_profit: profitCalc.netProfit,
                      roi_percentage: profitCalc.roiPercentage,
                      profit_margin: profitCalc.profitMargin,
                      profit_category: profitCalc.profitCategory,
                      uk_sales_rank: salesRank,
                      sales_per_month: salesPerMonth,
                      competitors_count: b2cPricing.numberOfOffers || 0,
                      quantity_tiers: b2bPricing.quantityTiers || null,
                      metadata: {
                        quantity_for_lowest_price: b2bPricing.quantityTier || 1,
                        standard_b2b_price: b2bPricing.standardPrice
                      }
                    });

                  // Save to price history
                  await supabase
                    .from('b2b_price_history')
                    .insert({
                      user_id: user.id,
                      asin,
                      uk_b2b_price: profitCalc.ukB2bPrice,
                      uk_b2c_price: profitCalc.ukB2cPrice,
                      price_difference: profitCalc.priceDifference,
                      discount_percentage: profitCalc.discountPercentage
                    });

                  opportunitiesFound++;
                  allOpportunities.push(opportunity);
                  
                  // Stream opportunity to frontend
                  sendMessage({ 
                    type: 'opportunity', 
                    data: opportunity 
                  });

                } catch (error) {
                  console.error(`Error processing ${asin}:`, error);
                }

                totalProcessed++;
              }

            } catch (error) {
              console.error(`Batch processing error:`, error);
              sendMessage({ 
                type: 'error', 
                data: { 
                  error: `Error processing batch ${batchNumber}: ${error}` 
                } 
              });
            }
          }

          // Update scan as completed
          await supabase
            .from('arbitrage_scans')
            .update({
              status: 'completed',
              progress_percentage: 100,
              current_step: 'Scan completed',
              processed_count: totalProcessed,
              opportunities_found: opportunitiesFound,
              completed_at: new Date().toISOString()
            })
            .eq('id', scanId);

          // Send completion message
          sendMessage({ 
            type: 'complete', 
            data: { 
              message: 'B2B arbitrage analysis completed',
              totalProducts: totalProcessed,
              opportunitiesFound,
              scanId,
              excludedCount
            } 
          });

        } catch (error: any) {
          console.error('Stream processing error:', error);
          
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'failed',
                error_message: error.message,
                completed_at: new Date().toISOString()
              })
              .eq('id', scanId);
          }
          
          sendMessage({ 
            type: 'error', 
            data: { 
              error: error.message || 'An error occurred during analysis' 
            } 
          });
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('API route error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }
    
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 }
      );
    }
    
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}