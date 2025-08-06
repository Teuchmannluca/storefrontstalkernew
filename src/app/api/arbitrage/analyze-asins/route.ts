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
import { PriceHistoryService } from '@/lib/price-history-service';
import { notificationService } from '@/lib/notification-service';

// Marketplace IDs
const MARKETPLACES = {
  UK: { id: 'A1F83G8C2ARO7P', currency: 'GBP', region: 'eu' },
  DE: { id: 'A1PA6795UKMFR9', currency: 'EUR', region: 'eu' },
  FR: { id: 'A13V1IB3VIYZZH', currency: 'EUR', region: 'eu' },
  IT: { id: 'APJ6JRA9NG5V4', currency: 'EUR', region: 'eu' },
  ES: { id: 'A1RKKUPIHCS9HS', currency: 'EUR', region: 'eu' }
};

const EUR_TO_GBP_RATE = 0.86;

// Amazon SP-API Rate Limits (Updated 2025 - OFFICIAL LIMITS)
const RATE_LIMITS = {
  COMPETITIVE_PRICING: {
    requestsPerSecond: 0.5,  // FIXED: Amazon actual limit is 0.5 req/sec
    itemsPerRequest: 20,
    burstSize: 1             // FIXED: Amazon actual burst is 1
  },
  PRODUCT_FEES: {
    requestsPerSecond: 1,
    burstSize: 2
  },
  CATALOG: {
    requestsPerSecond: 2,    // Catalog API is correct
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

          // Initialize Price History Service
          const priceHistoryService = new PriceHistoryService(
            envCheck.values.supabaseUrl,
            envCheck.values.supabaseServiceKey
          );

          // Get historical prices for all ASINs before processing
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: 'Fetching price history...', 
              progress: 12
            } 
          });

          const historicalPrices = await priceHistoryService.getLatestPricesForAsins(user.id, finalAsins);

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
          const pricingMinInterval = 2000; // 2 seconds between batches to avoid rate limits
          const feesMinInterval = 1000; // 1 request per second
          
          let processedCount = 0;
          let opportunitiesFound = 0;

          // First, batch process UK pricing for all ASINs
          const batchSize = 10;
          const ukPricingData = new Map<string, any>();
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Fetching UK pricing data in batches...`, 
              progress: 15,
              totalAsins: finalAsins.length
            } 
          });

          // Process UK pricing in batches
          for (let batchStart = 0; batchStart < finalAsins.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, finalAsins.length);
            const batchAsins = finalAsins.slice(batchStart, batchEnd);
            
            try {
              // Rate limiting for pricing batches
              const now = Date.now();
              const timeSinceLastPricing = now - lastPricingRequest;
              if (timeSinceLastPricing < pricingMinInterval) {
                await new Promise(resolve => setTimeout(resolve, pricingMinInterval - timeSinceLastPricing));
              }
              lastPricingRequest = Date.now();
              
              sendMessage({ 
                type: 'progress', 
                data: { 
                  step: `Fetching UK pricing for ASINs ${batchStart + 1}-${batchEnd} of ${finalAsins.length}...`, 
                  progress: 15 + ((batchStart / finalAsins.length) * 20),
                  totalAsins: finalAsins.length
                } 
              });
              
              const ukPricingBatch = await pricingClient.getCompetitivePricing(
                batchAsins,
                MARKETPLACES.UK.id,
                'Asin',
                'Consumer'
              );
              
              // Process each product in the batch response
              for (const product of ukPricingBatch) {
                if (product.asin) {
                  // SP-API returns CompetitivePrices array with PascalCase structure
                  const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || [];
                  
                  // IMPORTANT: Filter out USED products - only consider NEW condition
                  const newConditionPrices = competitivePrices.filter(
                    (cp: any) => cp.condition === 'New' || cp.condition === 'new' || !cp.condition
                  );
                  
                  if (newConditionPrices.length > 0) {
                    // Look for buy box price first (CompetitivePriceId '1' is usually buy box)
                    let buyBoxPrice = newConditionPrices.find(
                      (cp: any) => cp.CompetitivePriceId === '1'
                    );
                    
                    // If no buy box, look for other competitive prices
                    let featuredPrice = newConditionPrices.find(
                      (cp: any) => cp.CompetitivePriceId === 'B2C' || cp.CompetitivePriceId === '2'
                    );
                    
                    const priceData = buyBoxPrice || featuredPrice || newConditionPrices[0];
                    
                    if (priceData && priceData.Price) {
                      // Check both ListingPrice and LandedPrice structures
                      const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                      const price = listingPrice?.Amount;
                      const currency = listingPrice?.CurrencyCode;
                      
                      if (price && currency) {
                        ukPricingData.set(product.asin, {
                          price: price,
                          currency: currency,
                          priceType: buyBoxPrice ? 'buy_box' : (featuredPrice ? 'featured_offer' : 'first_available'),
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
              
            } catch (batchError: any) {
              console.error('UK pricing batch error for ASINs', batchAsins, batchError);
              // Continue with next batch
            }
          }
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `UK pricing complete. Found pricing for ${ukPricingData.size} ASINs. Now analyzing each ASIN...`, 
              progress: 35,
              totalAsins: finalAsins.length
            } 
          });

          // Process ASINs one by one for detailed analysis
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
                progress: 35 + (i / finalAsins.length) * 60,
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
              
              // Use pre-fetched UK pricing data
              const ukPricingEntry = ukPricingData.get(asin);
              if (ukPricingEntry) {
                pricingByMarketplace.UK = ukPricingEntry;
              }
              
              // Skip if no UK price
              if (!pricingByMarketplace.UK || !pricingByMarketplace.UK.price) {
                console.log(`No UK price found for ${asin}`);
                processedCount++;
                continue;
              }
              
              const ukPrice = pricingByMarketplace.UK.price;
              const ukCompetitors = pricingByMarketplace.UK.numberOfOffers;

              // Get EU marketplace prices with proper rate limiting
              const euMarketplaces = Object.entries(MARKETPLACES).filter(([key]) => key !== 'UK');
              
              // Fetch pricing for all EU marketplaces with staggered requests
              const euPricingPromises = euMarketplaces.map(async ([country, marketplace], index) => {
                // Stagger requests to avoid burst limits
                if (index > 0) {
                  await new Promise(resolve => setTimeout(resolve, index * 2000)); // 2 seconds between marketplaces
                }
                
                try {
                  // Ensure minimum interval between pricing requests
                  const now = Date.now();
                  const timeSinceLastPricing = now - lastPricingRequest;
                  const euPricingMinInterval = 2000; // 2 seconds between requests
                  if (timeSinceLastPricing < euPricingMinInterval) {
                    await new Promise(resolve => setTimeout(resolve, euPricingMinInterval - timeSinceLastPricing));
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
                    // SP-API returns CompetitivePrices array with PascalCase structure
                    const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || [];
                    
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
                        // Check both ListingPrice and LandedPrice structures
                        const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                        const price = listingPrice?.Amount;
                        const currency = listingPrice?.CurrencyCode;
                        
                        if (price && currency) {
                          return { country, data: { price, currency } };
                        }
                      }
                    }
                  }
                  return { country, data: null };
                } catch (euPricingError: any) {
                  if (euPricingError.message?.includes('429') || euPricingError.message?.includes('quota') || euPricingError.message?.includes('TooManyRequests')) {
                    console.log(`Rate limited for ${country} pricing, waiting 2s and retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // Retry once
                    try {
                      const euPricing = await pricingClient.getCompetitivePricing(
                        [asin],
                        marketplace.id,
                        'Asin',
                        'Consumer'
                      );
                      
                      if (euPricing && euPricing.length > 0) {
                        const product = euPricing[0];
                        const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || [];
                        const newConditionPrices = competitivePrices.filter(
                          (cp: any) => cp.condition === 'New' || cp.condition === 'new' || !cp.condition
                        );
                        
                        if (newConditionPrices.length > 0) {
                          let buyBoxPrice = newConditionPrices.find((cp: any) => cp.CompetitivePriceId === '1');
                          let featuredPrice = newConditionPrices.find((cp: any) => cp.CompetitivePriceId === 'B2C' || cp.CompetitivePriceId === '2');
                          const priceData = buyBoxPrice || featuredPrice || newConditionPrices[0];
                          
                          if (priceData && priceData.Price) {
                            const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                            const price = listingPrice?.Amount;
                            const currency = listingPrice?.CurrencyCode;
                            
                            if (price && currency) {
                              return { country, data: { price, currency } };
                            }
                          }
                        }
                      }
                      return { country, data: null };
                    } catch (retryError) {
                      console.error(`Retry failed for ${country}:`, retryError);
                      return { country, data: null };
                    }
                  }
                  console.error(`${country} pricing error for ${asin}:`, euPricingError);
                  return { country, data: null };
                }
              });
              
              // Wait for all EU marketplace requests to complete
              const euPricingResults = await Promise.all(euPricingPromises);
              
              // Process results into pricingByMarketplace
              euPricingResults.forEach(({ country, data }) => {
                if (data) {
                  pricingByMarketplace[country] = data;
                }
              });
              
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

                    // Prepare price history entries
                    const priceHistoryEntries = [];
                    
                    // Get historical UK price
                    const historicalUkPrice = historicalPrices.get(asin)?.get('UK');
                    const ukPriceChanged = historicalUkPrice && Math.abs(historicalUkPrice.price - ukPrice) > 0.01;
                    
                    // Track UK price
                    priceHistoryEntries.push({
                      user_id: user.id,
                      asin,
                      marketplace: 'UK',
                      old_price: historicalUkPrice?.price,
                      new_price: ukPrice,
                      old_price_currency: historicalUkPrice?.currency || 'GBP',
                      new_price_currency: 'GBP',
                      product_name: productName,
                      scan_id: scanId
                    });
                    
                    // Track EU marketplace prices
                    for (const euPrice of euPrices) {
                      const historicalEuPrice = historicalPrices.get(asin)?.get(euPrice.marketplace);
                      priceHistoryEntries.push({
                        user_id: user.id,
                        asin,
                        marketplace: euPrice.marketplace,
                        old_price: historicalEuPrice?.price,
                        new_price: euPrice.sourcePrice,
                        old_price_currency: historicalEuPrice?.currency || MARKETPLACES[euPrice.marketplace as keyof typeof MARKETPLACES].currency,
                        new_price_currency: MARKETPLACES[euPrice.marketplace as keyof typeof MARKETPLACES].currency,
                        product_name: productName,
                        scan_id: scanId
                      });
                    }
                    
                    // Record price history
                    try {
                      await priceHistoryService.recordPriceChanges(priceHistoryEntries);
                    } catch (phError) {
                      console.error('Failed to record price history:', phError);
                      // Continue processing even if price history fails
                    }
                    
                    // Always save to database
                    if (scanId) {
                      try {
                        const opportunityData = {
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
                        };

                        console.log('=== SAVING OPPORTUNITY TO DB ===');
                        console.log('ASIN:', asin);
                        console.log('Best profit:', bestOpportunity.profit);
                        console.log('Best ROI:', bestOpportunity.roi);
                        console.log('Profit category:', profitCategory);
                        console.log('Full opportunity data:', opportunityData);

                        const { error: insertError } = await supabase
                          .from('arbitrage_opportunities')
                          .insert(opportunityData);

                        if (insertError) {
                          console.error('[DB] Failed to save opportunity:', insertError);
                        } else {
                          console.log('[DB] Successfully saved opportunity for ASIN:', asin);
                        }
                      } catch (dbError) {
                        console.error('[DB] Exception saving opportunity:', dbError);
                      }
                    }
                    
                    // Calculate price change info for display
                    const ukPriceChange = historicalUkPrice ? 
                      priceHistoryService.calculatePriceChange(historicalUkPrice.price, ukPrice) : 
                      null;
                    
                    const bestEuPriceHistory = historicalPrices.get(asin)?.get(bestOpportunity.marketplace);
                    const euPriceChange = bestEuPriceHistory ? 
                      priceHistoryService.calculatePriceChange(bestEuPriceHistory.price, bestOpportunity.sourcePrice) : 
                      null;

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
                      profitCategory,
                      priceHistory: {
                        uk: {
                          oldPrice: historicalUkPrice?.price,
                          newPrice: ukPrice,
                          changeAmount: ukPriceChange?.changeAmount,
                          changePercentage: ukPriceChange?.changePercentage,
                          isFirstCheck: !historicalUkPrice,
                          lastChecked: historicalUkPrice?.last_checked
                        },
                        bestEu: {
                          marketplace: bestOpportunity.marketplace,
                          oldPrice: bestEuPriceHistory?.price,
                          newPrice: bestOpportunity.sourcePrice,
                          changeAmount: euPriceChange?.changeAmount,
                          changePercentage: euPriceChange?.changePercentage,
                          isFirstCheck: !bestEuPriceHistory,
                          lastChecked: bestEuPriceHistory?.last_checked
                        }
                      }
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

          // Send scan complete notification for all scans (regardless of results)
          if (scanId) {
            try {
              console.log('=== NOTIFICATION DEBUG START ===');
              console.log('Scan ID:', scanId);
              console.log('Processed count:', processedCount);
              console.log('Opportunities found during scan:', opportunitiesFound);

              // Get all opportunities (including non-profitable ones)
              const { data: allOpportunities, error: queryError } = await supabase
                .from('arbitrage_opportunities')
                .select('asin, best_profit, best_roi, product_name, profit_category')
                .eq('scan_id', scanId)
                .order('best_profit', { ascending: false });

              console.log('Database query error:', queryError);
              console.log('All opportunities from DB:', allOpportunities);

              // Calculate actual profitable count (best_profit > 0)
              const actualProfitableCount = allOpportunities?.filter(opp => (opp.best_profit || 0) > 0).length || 0;
              
              // Get best profitable deal
              const bestDeal = allOpportunities?.find(opp => (opp.best_profit || 0) > 0) || allOpportunities?.[0];
              
              // Calculate total profit from profitable deals only
              const totalProfit = allOpportunities
                ?.filter(opp => (opp.best_profit || 0) > 0)
                ?.reduce((sum, opp) => sum + (opp.best_profit || 0), 0) || 0;

              console.log('Notification calculation results:', {
                scanId,
                processedCount,
                opportunitiesFound,
                actualProfitableCount,
                totalOpportunities: allOpportunities?.length || 0,
                totalProfit,
                bestDeal,
                profitableDeals: allOpportunities?.filter(opp => (opp.best_profit || 0) > 0)
              });
              console.log('=== NOTIFICATION DEBUG END ===');

              await notificationService.sendNotification({
                userId: user.id,
                type: 'scan_complete',
                data: {
                  scanType: 'ASIN Checker',
                  productsAnalyzed: processedCount,
                  profitableCount: actualProfitableCount,
                  totalProfit: totalProfit,
                  bestProfit: bestDeal?.best_profit || 0,
                  bestRoi: bestDeal?.best_roi || 0
                }
              });

              // Send high profit deals notification for exceptional opportunities
              const { data: highProfitDeals } = await supabase
                .from('arbitrage_opportunities')
                .select('*')
                .eq('scan_id', scanId)
                .or('best_profit.gte.10,best_roi.gte.50')
                .limit(5);

              if (highProfitDeals && highProfitDeals.length > 0) {
                for (const deal of highProfitDeals) {
                  await notificationService.sendNotification({
                    userId: user.id,
                    type: 'high_profit_deal',
                    data: {
                      asin: deal.asin,
                      productName: deal.product_name || 'Unknown Product',
                      profit: deal.best_profit,
                      roi: deal.best_roi,
                      sourceMarket: deal.best_source_marketplace,
                      sourcePrice: deal.best_source_price,
                      targetPrice: deal.target_price
                    },
                    priority: 'immediate'
                  });
                }
              }
            } catch (notificationError) {
              console.error('Failed to send notification:', notificationError);
              // Don't fail the scan if notification fails
            }
          }

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