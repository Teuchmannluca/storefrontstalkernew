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
import { categorizeProfitLevel } from '@/lib/profit-categorizer';
import { estimateMonthlySalesFromRank } from '@/lib/sales-estimator';

// Marketplace IDs
const MARKETPLACES = {
  UK: { id: 'A1F83G8C2ARO7P', currency: 'GBP', region: 'eu' },
  DE: { id: 'A1PA6795UKMFR9', currency: 'EUR', region: 'eu' },
  FR: { id: 'A13V1IB3VIYZZH', currency: 'EUR', region: 'eu' },
  IT: { id: 'APJ6JRA9NG5V4', currency: 'EUR', region: 'eu' },
  ES: { id: 'A1RKKUPIHCS9HS', currency: 'EUR', region: 'eu' }
};

const EUR_TO_GBP_RATE = 0.86;

// Rate Limits Configuration
const RATE_LIMITS = {
  COMPETITIVE_PRICING: {
    requestsPerSecond: 0.5,
    itemsPerRequest: 20,
    minInterval: 2000  // 2 seconds between requests
  },
  PRODUCT_FEES: {
    requestsPerSecond: 1,
    minInterval: 1000  // 1 second between requests
  },
  CATALOG: {
    requestsPerSecond: 2,
    minInterval: 500   // 500ms between requests
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
          sendMessage({ type: 'progress', data: { step: 'Initializing scan...', progress: 0 } });

          // Create scan record
          const { data: scan, error: scanError } = await supabase
            .from('arbitrage_scans')
            .insert({
              user_id: user.id,
              scan_type: 'asin_check',
              storefront_name: 'ASIN Checker (Stream)',
              status: 'running',
              metadata: {
                exchange_rate: EUR_TO_GBP_RATE,
                marketplaces: Object.keys(MARKETPLACES),
                asins_count: validASINs.length
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
            marketplaceId: MARKETPLACES.UK.id,
            region: 'eu' as const,
          };

          const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
          const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);
          const catalogClient = new SPAPICatalogClient(credentials, spApiConfig);

          // Initialize blacklist service
          const blacklistService = new BlacklistService(
            envCheck.values.supabaseUrl,
            envCheck.values.supabaseServiceKey
          );
          
          const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
          const { filteredProducts, excludedCount } = blacklistService.filterBlacklistedProducts(
            validASINs.map(asin => ({ asin })),
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

          // STREAMING APPROACH: Process each batch completely before moving to next
          const batchSize = RATE_LIMITS.COMPETITIVE_PRICING.itemsPerRequest;
          let totalProcessed = 0;
          let opportunitiesFound = 0;

          // Process in batches
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
              // Step 1: Fetch UK pricing for this batch
              await rateLimiter.throttle('uk-pricing', RATE_LIMITS.COMPETITIVE_PRICING.minInterval);
              
              const ukPricingBatch = await pricingClient.getCompetitivePricing(
                batchAsins,
                MARKETPLACES.UK.id,
                'Asin',
                'Consumer'
              );

              // Parse UK pricing
              const ukPricingMap = new Map<string, any>();
              for (const product of ukPricingBatch) {
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
                        ukPricingMap.set(product.asin, {
                          price: listingPrice.Amount,
                          currency: listingPrice.CurrencyCode,
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

              // Step 2: Fetch EU pricing for this batch (all marketplaces in parallel)
              const euPricingMap = new Map<string, Map<string, any>>();
              const euMarketplaces = Object.entries(MARKETPLACES).filter(([key]) => key !== 'UK');
              
              const euPromises = euMarketplaces.map(async ([country, marketplace]) => {
                try {
                  await rateLimiter.throttle(`eu-pricing-${country}`, RATE_LIMITS.COMPETITIVE_PRICING.minInterval);
                  
                  const euPricingBatch = await pricingClient.getCompetitivePricing(
                    batchAsins,
                    marketplace.id,
                    'Asin',
                    'Consumer'
                  );

                  for (const product of euPricingBatch) {
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
                            if (!euPricingMap.has(product.asin)) {
                              euPricingMap.set(product.asin, new Map());
                            }
                            euPricingMap.get(product.asin)!.set(country, {
                              price: listingPrice.Amount,
                              currency: listingPrice.CurrencyCode || marketplace.currency
                            });
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.error(`EU pricing error for ${country}:`, error);
                }
              });

              await Promise.all(euPromises);

              // Step 3: Analyze each ASIN in this batch immediately
              for (const asin of batchAsins) {
                const ukPricing = ukPricingMap.get(asin);
                if (!ukPricing?.price) {
                  totalProcessed++;
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
                      [MARKETPLACES.UK.id],
                      ['attributes', 'images', 'salesRanks']
                    );
                    
                    if (catalogData?.attributes?.title?.[0]?.value) {
                      productName = catalogData.attributes.title[0].value;
                    }
                    if (catalogData?.images?.[0]?.images?.[0]?.link) {
                      productImage = catalogData.images[0].images[0].link;
                    }
                    if (catalogData?.salesRanks?.[0]?.ranks?.[0]?.rank) {
                      salesRank = catalogData.salesRanks[0].ranks[0].rank;
                    }
                  } catch (catalogError) {
                    console.error('Catalog error for', asin, catalogError);
                  }

                  const salesPerMonth = salesRank > 0 ? estimateMonthlySalesFromRank(salesRank) : 0;

                  // Calculate fees
                  await rateLimiter.throttle('fees', RATE_LIMITS.PRODUCT_FEES.minInterval);
                  
                  const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
                    asin,
                    {
                      listingPrice: {
                        currencyCode: 'GBP',
                        amount: ukPricing.price
                      }
                    },
                    MARKETPLACES.UK.id
                  );

                  if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
                    const fees = feesEstimate.feesEstimate;
                    const feeDetails = fees.feeDetailList || [];
                    
                    const referralFee = feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee.amount || 0;
                    const amazonFees = fees.totalFeesEstimate?.amount || 0;
                    const digitalServicesFee = amazonFees * 0.02;

                    // Check EU prices for opportunities
                    const euPrices: any[] = [];
                    let bestOpportunity: any = null;
                    const euPricingForAsin = euPricingMap.get(asin);

                    if (euPricingForAsin) {
                      for (const [country, pricing] of euPricingForAsin.entries()) {
                        const sourcePrice = pricing.price;
                        const sourcePriceGBP = pricing.currency === 'EUR' 
                          ? sourcePrice * EUR_TO_GBP_RATE 
                          : sourcePrice;

                        const vatRate = 0.20;
                        const vatOnSale = ukPricing.price / (1 + vatRate) * vatRate;
                        const netRevenue = ukPricing.price - vatOnSale;
                        const totalCosts = sourcePriceGBP + amazonFees + digitalServicesFee;
                        const profit = netRevenue - totalCosts;
                        const roi = (profit / sourcePriceGBP) * 100;
                        const profitMargin = (profit / netRevenue) * 100;

                        const marketplacePrice = {
                          marketplace: country,
                          sourcePrice,
                          sourcePriceGBP,
                          profit,
                          profitMargin,
                          roi,
                          totalCost: totalCosts
                        };

                        euPrices.push(marketplacePrice);

                        if (!bestOpportunity || roi > bestOpportunity.roi) {
                          bestOpportunity = marketplacePrice;
                        }
                      }
                    }

                    if (bestOpportunity) {
                      const profitCategory = categorizeProfitLevel(bestOpportunity.profit);
                      
                      if (bestOpportunity.profit > 0) {
                        opportunitiesFound++;
                      }

                      // Save to database
                      if (scanId) {
                        await supabase
                          .from('arbitrage_opportunities')
                          .insert({
                            scan_id: scanId,
                            asin,
                            product_name: productName,
                            product_image: productImage,
                            target_price: ukPricing.price,
                            amazon_fees: amazonFees,
                            referral_fee: referralFee,
                            digital_services_fee: digitalServicesFee,
                            uk_competitors: ukPricing.numberOfOffers,
                            uk_sales_rank: salesRank,
                            sales_per_month: salesPerMonth,
                            best_source_marketplace: bestOpportunity.marketplace,
                            best_source_price: bestOpportunity.sourcePrice,
                            best_source_price_gbp: bestOpportunity.sourcePriceGBP,
                            best_profit: bestOpportunity.profit,
                            best_roi: bestOpportunity.roi,
                            profit_category: profitCategory,
                            all_marketplace_prices: { euPrices }
                          });
                      }

                      // IMMEDIATELY send opportunity to UI
                      const opportunity = {
                        asin,
                        productName,
                        productImage,
                        targetPrice: ukPricing.price,
                        amazonFees,
                        referralFee,
                        digitalServicesFee,
                        ukCompetitors: ukPricing.numberOfOffers,
                        ukSalesRank: salesRank,
                        salesPerMonth,
                        euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                        bestOpportunity,
                        profitCategory
                      };

                      sendMessage({ type: 'opportunity', data: opportunity });
                    }
                  }
                } catch (error: any) {
                  console.error(`Error processing ${asin}:`, error);
                }

                totalProcessed++;
                
                // Update progress after each ASIN
                const currentProgress = (totalProcessed / finalAsins.length) * 100;
                const currentStep = `Analyzed ${totalProcessed}/${finalAsins.length} ASINs, found ${opportunitiesFound} opportunities`;
                
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: currentStep,
                    progress: currentProgress,
                    scanId,
                    processedCount: totalProcessed,
                    totalAsins: finalAsins.length,
                    opportunitiesFound
                  } 
                });
                
                // Update database every 5 ASINs
                if (totalProcessed % 5 === 0) {
                  await updateScanProgress(currentProgress, currentStep, totalProcessed);
                }
              }

            } catch (batchError: any) {
              console.error(`Batch processing error:`, batchError);
            }
          }

          // Update scan record as completed
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'completed',
                total_products: validASINs.length,
                unique_asins: finalAsins.length,
                opportunities_found: opportunitiesFound,
                completed_at: new Date().toISOString(),
                progress_percentage: 100,
                current_step: 'Analysis complete',
                processed_count: finalAsins.length,
                last_updated: new Date().toISOString()
              })
              .eq('id', scanId);
          }

          sendMessage({ 
            type: 'complete', 
            data: { 
              totalAsins: finalAsins.length,
              opportunitiesFound,
              message: `Analysis complete! Analyzed ${finalAsins.length} ASINs and found ${opportunitiesFound} profitable opportunities.`,
              scanId
            } 
          });

        } catch (error: any) {
          console.error('Streaming analysis error:', error);
          
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'failed',
                error_message: error.message || 'Analysis failed',
                completed_at: new Date().toISOString()
              })
              .eq('id', scanId);
          }
          
          sendMessage({ 
            type: 'error', 
            data: { error: error.message || 'Analysis failed' } 
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Request error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    }
    
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}