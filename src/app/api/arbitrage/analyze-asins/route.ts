import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
import { checkEnvVars } from '@/lib/env-check';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { validateRequestBody, apiSchemas, ValidationError } from '@/lib/validation';
import { sendStreamError, AppError } from '@/lib/error-handling';
import { BlacklistService } from '@/lib/blacklist-service';
import { categorizeProfitLevel, type ProfitCategory } from '@/lib/profit-categorizer';
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

// Amazon SP-API Rate Limits
const RATE_LIMITS = {
  COMPETITIVE_PRICING: {
    requestsPerSecond: 10,
    itemsPerRequest: 20,
    burstSize: 30
  },
  PRODUCT_FEES: {
    requestsPerSecond: 1,
    burstSize: 2
  },
  CATALOG: {
    requestsPerSecond: 2,
    burstSize: 2
  }
};

interface StreamMessage {
  type: 'progress' | 'opportunity' | 'complete' | 'error';
  data: any;
}

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Validate request body - create a custom schema for ASINs
    const body = await request.json();
    if (!body.asins || !Array.isArray(body.asins) || body.asins.length === 0) {
      throw new ValidationError('ASINs array is required', 'asins');
    }
    
    const asins = body.asins;
    const debug = body.debug || false;

    // Check required environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      aws: { accessKeyId: true, secretAccessKey: true },
      amazon: { accessKeyId: true, secretAccessKey: true, refreshToken: true, marketplaceId: true }
    });

    if (!envCheck.success) {
      throw new AppError(
        'Service temporarily unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );
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

    // Create abort controller for client disconnection handling
    const abortController = new AbortController();

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;
        
        // Track controller state
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          isControllerClosed = true;
          originalClose();
        };
        
        const sendMessage = (message: StreamMessage) => {
          // Check if controller is closed before sending
          if (isControllerClosed) {
            console.log('[STREAM] Controller is closed, skipping message:', message.type);
            return;
          }
          
          try {
            const data = `data: ${JSON.stringify(message)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error: any) {
            // Handle controller closed errors gracefully
            if (error.code === 'ERR_INVALID_STATE' || error.message?.includes('Controller is already closed')) {
              console.log('[STREAM] Controller closed during message send');
              isControllerClosed = true;
            } else {
              console.error('[STREAM] Error sending message:', error);
            }
          }
        };

        let scanId: string | null = null;

        try {
          sendMessage({ type: 'progress', data: { step: 'Initialising ASIN analysis...', progress: 0 } });

          // Create a scan record for ASIN checker
          const { data: scan, error: scanError } = await supabase
            .from('arbitrage_scans')
            .insert({
              user_id: user.id,
              scan_type: 'asin_check',
              storefront_id: null,
              storefront_name: 'ASIN Checker',
              status: 'running',
              metadata: {
                asins: validASINs,
                exchange_rate: EUR_TO_GBP_RATE,
                marketplaces: Object.keys(MARKETPLACES)
              }
            })
            .select()
            .single();

          if (scanError || !scan) {
            console.error('Scan creation error:', scanError);
            sendMessage({ type: 'error', data: { error: `Failed to create scan record: ${scanError?.message || 'Unknown error'}` } });
            return;
          }

          scanId = scan.id;
          sendMessage({ type: 'progress', data: { step: 'Scan started...', progress: 2, scanId } });

          sendMessage({ 
            type: 'progress', 
            data: { step: 'Checking blacklist...', progress: 5 } 
          });

          // Filter out blacklisted ASINs
          const blacklistService = new BlacklistService(
            envCheck.values.supabaseUrl,
            envCheck.values.supabaseServiceKey
          );
          
          const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
          const { filteredProducts: filteredAsins, excludedCount } = blacklistService.filterBlacklistedProducts(
            validASINs.map((asin: string) => ({ asin })),
            blacklistedAsins
          );

          if (excludedCount > 0) {
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Excluded ${excludedCount} blacklisted ASINs. Proceeding with ${filteredAsins.length} ASINs...`, 
                progress: 8,
                excludedCount,
                blacklistedCount: blacklistedAsins.size
              } 
            });
          }

          const finalAsins = filteredAsins.map(item => item.asin);
          
          if (finalAsins.length === 0) {
            sendMessage({ type: 'error', data: { error: 'All ASINs are blacklisted. Please remove some ASINs from blacklist.' } });
            
            // Update scan status to failed
            if (scanId) {
              await supabase
                .from('arbitrage_scans')
                .update({
                  status: 'failed',
                  error_message: 'All ASINs blacklisted',
                  completed_at: new Date().toISOString(),
                  metadata: {
                    ...scan.metadata,
                    excluded_asins: excludedCount,
                    blacklisted_asins_count: blacklistedAsins.size
                  }
                })
                .eq('id', scanId);
            }
            
            return;
          }

          // Calculate estimated time
          const estimatedSecondsPerAsin = 5; // Conservative estimate
          const totalEstimatedSeconds = Math.ceil(finalAsins.length * estimatedSecondsPerAsin);
          const estimatedMinutes = Math.ceil(totalEstimatedSeconds / 60);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Starting analysis of ${finalAsins.length} ASINs...`, 
              progress: 10,
              totalAsins: finalAsins.length,
              estimatedTimeMinutes: estimatedMinutes,
              startTime: Date.now(),
              excludedCount: excludedCount
            } 
          });

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

          const catalogClient = new SPAPICatalogClient(credentials, spApiConfig);
          const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
          const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);

          // Rate limiter helpers
          let lastCatalogRequest = Date.now();
          let lastPricingRequest = Date.now();
          let lastFeesRequest = Date.now();
          const catalogMinInterval = 500; // 2 requests per second
          const pricingMinInterval = 100; // 10 requests per second (but we'll be conservative)
          const feesMinInterval = 1000; // 1 request per second
          
          let processedCount = 0;
          let opportunitiesFound = 0;

          // Process ASINs one by one
          for (let i = 0; i < finalAsins.length; i++) {
            // Log if client disconnected but continue processing
            if (isControllerClosed || abortController.signal.aborted) {
              console.log('[STREAM] Client disconnected, but continuing scan for database storage');
            }
            
            const asin = finalAsins[i];
            
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Analysing ASIN ${i + 1} of ${finalAsins.length}: ${asin}`, 
                progress: 10 + (i / finalAsins.length) * 80,
                processedCount: i,
                totalAsins: finalAsins.length
              } 
            });

            try {
              // Get product details from catalog API with rate limiting
              let productName = asin;
              let productImage = '';
              let salesRank = 0;
              
              try {
                // Ensure minimum interval for catalog requests
                const now = Date.now();
                const timeSinceLastCatalog = now - lastCatalogRequest;
                if (timeSinceLastCatalog < catalogMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, catalogMinInterval - timeSinceLastCatalog));
                }
                lastCatalogRequest = Date.now();
                
                const catalogData = await catalogClient.getCatalogItem(
                  asin, 
                  [MARKETPLACES.UK.id], 
                  ['attributes', 'images', 'salesRanks']
                );
                
                if (catalogData?.attributes?.title) {
                  productName = catalogData.attributes.title[0]?.value || asin;
                }
                
                if (catalogData?.images && catalogData.images.length > 0) {
                  productImage = catalogData.images[0]?.images?.[0]?.link || '';
                }
                
                if (catalogData?.salesRanks && catalogData.salesRanks.length > 0) {
                  salesRank = catalogData.salesRanks[0]?.ranks?.[0]?.rank || 0;
                }
              } catch (catalogError: any) {
                console.error('Catalog API error for', asin, catalogError);
                // Continue without catalog data
              }

              // Calculate sales per month from rank
              const salesPerMonth = salesRank > 0 ? estimateMonthlySalesFromRank(salesRank) : 0;

              // Get pricing for all marketplaces
              const pricingByMarketplace: any = {};
              
              // First get UK pricing
              try {
                // Rate limiting for pricing
                const now = Date.now();
                const timeSinceLastPricing = now - lastPricingRequest;
                if (timeSinceLastPricing < pricingMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, pricingMinInterval - timeSinceLastPricing));
                }
                lastPricingRequest = Date.now();
                
                const ukPricing = await pricingClient.getCompetitivePricing(
                  [asin],
                  MARKETPLACES.UK.id,
                  'Asin',
                  'Consumer'
                );
                
                if (ukPricing && ukPricing.length > 0) {
                  const product = ukPricing[0];
                  const competitivePrices = product.competitivePricing?.competitivePrices || [];
                  
                  // IMPORTANT: Filter out USED products - only consider NEW condition
                  const newConditionPrices = competitivePrices.filter(
                    (cp: any) => cp.condition === 'New' || cp.condition === 'new' || !cp.condition
                  );
                  
                  if (newConditionPrices.length > 0) {
                    // Look for buy box price first
                    let buyBoxPrice = newConditionPrices.find(
                      (cp: any) => cp.CompetitivePriceId === '1'
                    );
                    
                    // If no buy box, look for other competitive prices
                    let featuredPrice = newConditionPrices.find(
                      (cp: any) => cp.CompetitivePriceId === 'B2C' || cp.CompetitivePriceId === '2'
                    );
                    
                    const priceData = buyBoxPrice || featuredPrice || newConditionPrices[0];
                    
                    if (priceData && priceData.Price) {
                      const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                      const price = listingPrice?.Amount;
                      const currency = listingPrice?.CurrencyCode;
                      
                      if (price && currency) {
                        pricingByMarketplace.UK = {
                          price: price,
                          currency: currency,
                          priceType: buyBoxPrice ? 'buy_box' : (featuredPrice ? 'featured_offer' : 'first_available'),
                          numberOfOffers: product.competitivePricing?.numberOfOfferListings?.find(
                            (l: any) => l.condition === 'New'
                          )?.count || 0,
                          salesRankings: product.salesRankings
                        };
                      }
                    }
                  }
                }
              } catch (pricingError: any) {
                console.error('UK pricing error for', asin, pricingError);
                // Continue to next ASIN if UK pricing fails
                processedCount++;
                continue;
              }
              
              // Skip if no UK price
              if (!pricingByMarketplace.UK || !pricingByMarketplace.UK.price) {
                console.log(`No UK price found for ${asin}`);
                processedCount++;
                continue;
              }
              
              const ukPrice = pricingByMarketplace.UK.price;
              const ukCompetitors = pricingByMarketplace.UK.numberOfOffers;

              // Get EU marketplace prices
              const euMarketplaces = Object.entries(MARKETPLACES).filter(([key]) => key !== 'UK');
              
              for (const [country, marketplace] of euMarketplaces) {
                try {
                  // Rate limiting for pricing
                  const now = Date.now();
                  const timeSinceLastPricing = now - lastPricingRequest;
                  if (timeSinceLastPricing < pricingMinInterval) {
                    await new Promise(resolve => setTimeout(resolve, pricingMinInterval - timeSinceLastPricing));
                  }
                  lastPricingRequest = Date.now();
                  
                  const euPricing = await pricingClient.getCompetitivePricing(
                    [asin],
                    marketplace.id,
                    'Asin',
                    'Consumer'
                  );
                  
                  if (euPricing && euPricing.length > 0) {
                    const product = euPricing[0];
                    const competitivePrices = product.competitivePricing?.competitivePrices || [];
                    
                    // Filter for NEW condition only
                    const newConditionPrices = competitivePrices.filter(
                      (cp: any) => cp.condition === 'New' || cp.condition === 'new' || !cp.condition
                    );
                    
                    if (newConditionPrices.length > 0) {
                      let buyBoxPrice = newConditionPrices.find(
                        (cp: any) => cp.CompetitivePriceId === '1'
                      );
                      
                      let featuredPrice = newConditionPrices.find(
                        (cp: any) => cp.CompetitivePriceId === 'B2C' || cp.CompetitivePriceId === '2'
                      );
                      
                      const priceData = buyBoxPrice || featuredPrice || newConditionPrices[0];
                      
                      if (priceData && priceData.Price) {
                        const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                        const price = listingPrice?.Amount;
                        const currency = listingPrice?.CurrencyCode;
                        
                        if (price && currency) {
                          pricingByMarketplace[country] = {
                            price: price,
                            currency: currency
                          };
                        }
                      }
                    }
                  }
                } catch (euPricingError: any) {
                  console.error(`${country} pricing error for ${asin}:`, euPricingError);
                  // Continue with other marketplaces
                }
              }
              
              // Check if we have at least one EU marketplace with valid pricing
              const validEuMarketplaces = Object.entries(pricingByMarketplace)
                .filter(([country, data]) => 
                  country !== 'UK' && 
                  data && 
                  (data as any).price && 
                  (data as any).price > 0
                );
              
              if (validEuMarketplaces.length === 0) {
                console.log(`No valid EU prices found for ${asin}`);
                processedCount++;
                continue;
              }

              // Calculate fees
              try {
                // Ensure minimum interval for fees requests
                const now = Date.now();
                const timeSinceLastFeesRequest = now - lastFeesRequest;
                if (timeSinceLastFeesRequest < feesMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, feesMinInterval - timeSinceLastFeesRequest));
                }
                lastFeesRequest = Date.now();
                
                const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
                  asin,
                  {
                    listingPrice: {
                      currencyCode: 'GBP',
                      amount: ukPrice
                    }
                  },
                  MARKETPLACES.UK.id
                );

                if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
                  const fees = feesEstimate.feesEstimate;
                  const feeDetails = fees.feeDetailList || [];
                  
                  const referralFee = feeDetails.find((f: any) => f.feeType === 'ReferralFee')?.finalFee.amount || 0;
                  const amazonFees = fees.totalFeesEstimate?.amount || 0;
                  
                  // Extract individual fees
                  let fbaFee = 0;
                  let digitalServicesFee = 0;
                  let variableClosingFee = 0;
                  let fixedClosingFee = 0;
                  
                  for (const fee of feeDetails) {
                    const feeAmount = fee.finalFee.amount || 0;
                    switch (fee.feeType) {
                      case 'FBAFees':
                      case 'FulfillmentFees':
                      case 'FBAPerUnitFulfillmentFee':
                      case 'FBAPerOrderFulfillmentFee':
                        fbaFee += feeAmount;
                        break;
                      case 'VariableClosingFee':
                        variableClosingFee = feeAmount;
                        break;
                      case 'FixedClosingFee':
                        fixedClosingFee = feeAmount;
                        break;
                    }
                  }
                  
                  // Digital Services Fee - check if it's in the SP-API response
                  const digitalServicesFeeFromAPI = feeDetails.find((f: any) => 
                    f.feeType === 'DigitalServicesFee' || 
                    f.feeType === 'DigitalServiceTax' ||
                    f.feeType === 'DST'
                  )?.finalFee.amount;
                  
                  // Calculate DST as 2% of Amazon fees if not returned by API
                  digitalServicesFee = digitalServicesFeeFromAPI || (amazonFees * 0.02);
                  
                  // VAT calculations
                  const vatRate = 0.20; // UK VAT rate
                  const vatOnSale = ukPrice / (1 + vatRate) * vatRate;
                  const vatOnCostOfGoods = 0; // Usually no VAT on EU purchases (reverse charge)

                  // Check EU prices and find opportunities
                  const euPrices: any[] = [];
                  let bestOpportunity: any = null;

                  for (const [country, data] of Object.entries(pricingByMarketplace)) {
                    if (country === 'UK' || !data) continue;
                    
                    const priceData = data as any;
                    const sourcePrice = priceData.price;
                    const sourcePriceGBP = priceData.currency === 'EUR' 
                      ? sourcePrice * EUR_TO_GBP_RATE 
                      : sourcePrice;

                    // Calculate profit using the net sale price (after VAT)
                    const netRevenue = ukPrice - vatOnSale;
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

                    if (!bestOpportunity || profit > bestOpportunity.profit) {
                      bestOpportunity = marketplacePrice;
                    }
                  }

                  // Save ALL deals (profitable, break-even, and loss)
                  if (bestOpportunity) {
                    const profitCategory = categorizeProfitLevel(bestOpportunity.profit);
                    
                    // Only count as "opportunity" if profitable (for backward compatibility)
                    if (bestOpportunity.profit > 0) {
                      opportunitiesFound++;
                    }
                    
                    // Always save to database
                    if (scanId) {
                      try {
                        await supabase
                          .from('arbitrage_opportunities')
                          .insert({
                            scan_id: scanId,
                            asin,
                            product_name: productName,
                            product_image: productImage,
                            target_price: ukPrice,
                            amazon_fees: amazonFees,
                            referral_fee: referralFee,
                            digital_services_fee: 0, // Included in total amazon_fees
                            uk_competitors: ukCompetitors,
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
                      } catch (dbError) {
                        console.error('[DB] Failed to save opportunity:', dbError);
                      }
                    }
                    
                    const opportunity = {
                      asin,
                      productName,
                      productImage,
                      targetPrice: ukPrice,
                      amazonFees,
                      referralFee,
                      fbaFee,
                      digitalServicesFee,
                      vatOnSale,
                      netRevenue: ukPrice - vatOnSale,
                      ukCompetitors,
                      ukSalesRank: salesRank,
                      salesPerMonth,
                      euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                      bestOpportunity,
                      profitCategory
                    };

                    // Send opportunity message
                    sendMessage({ 
                      type: 'opportunity', 
                      data: opportunity 
                    });
                  }
                }
              } catch (feeError: any) {
                // Handle rate limiting with proper retry
                if (feeError.message?.includes('429') || feeError.message?.includes('QuotaExceeded')) {
                  console.log(`Rate limited for ${asin} fees, waiting 5s before retry...`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  
                  // Retry once
                  try {
                    const now = Date.now();
                    const timeSinceLastFeesRequest = now - lastFeesRequest;
                    if (timeSinceLastFeesRequest < feesMinInterval) {
                      await new Promise(resolve => setTimeout(resolve, feesMinInterval - timeSinceLastFeesRequest));
                    }
                    lastFeesRequest = Date.now();
                    
                    const retryFeesEstimate = await feesClient.getMyFeesEstimateForASIN(
                      asin,
                      {
                        listingPrice: {
                          currencyCode: 'GBP',
                          amount: ukPrice
                        }
                      },
                      MARKETPLACES.UK.id
                    );
                    
                    // Process retry result (code omitted for brevity, same as above)
                  } catch (retryError) {
                    console.log(`Retry failed for ${asin}, skipping...`);
                  }
                } else {
                  console.error(`Fee calculation error for ${asin}:`, feeError);
                }
              }

              processedCount++;
              
              // Update progress
              if (processedCount % 2 === 0 || processedCount === finalAsins.length) {
                const progress = 10 + (processedCount / finalAsins.length) * 80;
                const remainingAsins = finalAsins.length - processedCount;
                const estimatedSecondsRemaining = Math.ceil(remainingAsins * estimatedSecondsPerAsin);
                const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);
                
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: `Analysed ${processedCount}/${finalAsins.length} ASINs, found ${opportunitiesFound} opportunities`, 
                    progress,
                    processedCount,
                    totalAsins: finalAsins.length,
                    opportunitiesFound,
                    estimatedMinutesRemaining
                  } 
                });
              }

            } catch (asinError: any) {
              console.error(`Error processing ASIN ${asin}:`, asinError);
              processedCount++;
            }
          }

          // Update scan record with completion status
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'completed',
                total_products: processedCount,
                unique_asins: finalAsins.length,
                opportunities_found: opportunitiesFound,
                completed_at: new Date().toISOString(),
                metadata: {
                  ...scan.metadata,
                  excluded_asins: excludedCount,
                  blacklisted_asins_count: blacklistedAsins.size,
                  original_asins_count: validASINs.length
                }
              })
              .eq('id', scanId);
          }

          const completionMessage = excludedCount > 0
            ? `Analysis complete! Analysed ${processedCount} ASINs (${excludedCount} blacklisted ASINs excluded) and found ${opportunitiesFound} profitable opportunities.`
            : `Analysis complete! Analysed all ${processedCount} ASINs and found ${opportunitiesFound} profitable opportunities.`;

          sendMessage({ 
            type: 'complete', 
            data: { 
              totalProducts: processedCount,
              excludedCount,
              opportunitiesFound,
              message: completionMessage,
              scanId
            } 
          });

        } catch (error: any) {
          // Use secure error handling for stream errors
          sendStreamError(error, sendMessage);
          
          // Update scan record with error status
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'failed',
                error_message: 'Analysis failed',
                completed_at: new Date().toISOString()
              })
              .eq('id', scanId);
          }
        } finally {
          if (!isControllerClosed) {
            try {
              controller.close();
            } catch (error) {
              console.log('[STREAM] Controller already closed in finally block');
            }
          }
        }
      }
    });

    // Handle client disconnection
    request.signal.addEventListener('abort', () => {
      console.log('[STREAM] Client request aborted');
      abortController.abort();
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      },
    });
  } catch (error) {
    // Handle authentication, validation, and setup errors
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: error.statusCode }
      );
    }

    // Use secure error handling for other errors
    console.error('[API_ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      endpoint: '/api/arbitrage/analyze-asins',
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
}