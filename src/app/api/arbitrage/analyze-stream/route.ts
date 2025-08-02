import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { checkEnvVars } from '@/lib/env-check';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { validateRequestBody, apiSchemas, ValidationError } from '@/lib/validation';
import { sendStreamError, AppError, ErrorCategory, MonitoredError } from '@/lib/error-handling';

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
// Competitive Pricing API: 10 requests per second, 20 items per request
// Product Fees API: 1 request per second
const RATE_LIMITS = {
  COMPETITIVE_PRICING: {
    requestsPerSecond: 10,
    itemsPerRequest: 20,
    burstSize: 30
  },
  PRODUCT_FEES: {
    requestsPerSecond: 1,
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
    
    // Validate request body
    const { storefrontId, debug = false } = await validateRequestBody(
      request,
      apiSchemas.storefrontAnalysis
    );

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

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
      const sendMessage = (message: StreamMessage) => {
        const data = `data: ${JSON.stringify(message)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      };

      let scanId: string | null = null;

      try {
        sendMessage({ type: 'progress', data: { step: 'Initialising scan...', progress: 0 } });

        // Fetch storefront details
        const { data: storefront } = await supabase
          .from('storefronts')
          .select('*')
          .eq('id', storefrontId)
          .single();
          
        if (!storefront) {
          sendMessage({ type: 'error', data: { error: 'Storefront not found' } });
          return;
        }

        // Create scan record
        const { data: scan, error: scanError } = await supabase
          .from('arbitrage_scans')
          .insert({
            user_id: user.id,
            scan_type: 'single_storefront',
            storefront_id: storefrontId,
            storefront_name: storefront.name,
            status: 'running',
            metadata: {
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

        // First get the total count
        const { count: totalCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('storefront_id', storefrontId);
        
        console.log(`Found ${totalCount} products for storefront ${storefrontId}`);
        
        sendMessage({ 
          type: 'progress', 
          data: { step: `Fetching ${totalCount || 0} products...`, progress: 5 } 
        });

        // Fetch all products without limit
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('storefront_id', storefrontId)
          .order('created_at', { ascending: false });

        if (productsError) {
          console.error('Error fetching products:', productsError);
          sendMessage({ type: 'error', data: { error: `Database error: ${productsError.message}` } });
          return;
        }

        if (!products || products.length === 0) {
          console.log(`No products found for storefront ${storefrontId}. Products:`, products);
          sendMessage({ type: 'error', data: { error: 'No products found. Please sync products first.' } });
          
          // Update scan status to failed
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'failed',
                error_message: 'No products found',
                completed_at: new Date().toISOString()
              })
              .eq('id', scanId);
          }
          
          return;
        }
        
        // Warning for very large storefronts
        if (products.length > 500) {
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `⚠️ Large storefront detected (${products.length} products). This analysis may take several minutes...`, 
              progress: 8 
            } 
          });
        }

        sendMessage({ 
          type: 'progress', 
          data: { step: `Loaded ${products.length} products, starting EU pricing analysis...`, progress: 10 } 
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

        const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
        const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);

        // Process products in batches respecting SP-API limits
        // Competitive Pricing API allows 20 items per request
        const batchSize = Math.min(20, products.length > 100 ? 10 : 15);
        
        // Rate limiter helper
        let lastPricingRequest = Date.now();
        let lastFeesRequest = Date.now();
        const pricingMinInterval = 2000; // 2 seconds between pricing requests to stay under quota
        const feesMinInterval = 1000 / RATE_LIMITS.PRODUCT_FEES.requestsPerSecond; // 1000ms
        let processedCount = 0;
        let opportunitiesFound = 0;

        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          const asins = batch.map(p => p.asin);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)}...`, 
              progress: 20 + (i / products.length) * 60 
            } 
          });

          try {
            // Fetch pricing for all marketplaces with proper rate limiting
            const pricingPromises = Object.entries(MARKETPLACES).map(async ([country, marketplace], index) => {
              // Stagger requests to avoid burst limits
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, index * pricingMinInterval));
              }
              
              try {
                // Ensure minimum interval between pricing requests
                const now = Date.now();
                const timeSinceLastRequest = now - lastPricingRequest;
                if (timeSinceLastRequest < pricingMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, pricingMinInterval - timeSinceLastRequest));
                }
                lastPricingRequest = Date.now();
                
                const pricing = await pricingClient.getCompetitivePricing(
                  asins,
                  marketplace.id,
                  'Asin',
                  'Consumer'
                );
                return { country, pricing };
              } catch (error: any) {
                if (error.message?.includes('429') || error.message?.includes('TooManyRequests')) {
                  console.log(`Rate limited for ${country} pricing, waiting 2s...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  // Retry once
                  try {
                    const pricing = await pricingClient.getCompetitivePricing(
                      asins,
                      marketplace.id,
                      'Asin',
                      'Consumer'
                    );
                    return { country, pricing };
                  } catch (retryError) {
                    console.error(`Retry failed for ${country}:`, retryError);
                    return { country, pricing: [] };
                  }
                }
                console.error(`Error fetching pricing for ${country}:`, error);
                return { country, pricing: [] };
              }
            });

            const allPricing = await Promise.all(pricingPromises);
            
            // Organize pricing data by ASIN
            const pricingByAsin = new Map<string, any>();
            
            allPricing.forEach(({ country, pricing }) => {
              pricing.forEach((product: any) => {
                const asin = product.asin;
                if (!pricingByAsin.has(asin)) {
                  pricingByAsin.set(asin, {});
                }
                
                let priceData = product.competitivePricing?.CompetitivePrices?.find(
                  (cp: any) => cp.CompetitivePriceId === '1'
                );
                
                if (!priceData && product.competitivePricing?.CompetitivePrices?.length > 0) {
                  priceData = product.competitivePricing.CompetitivePrices[0];
                }
                
                if (priceData && priceData.Price) {
                  pricingByAsin.get(asin)[country] = {
                    price: priceData.Price.ListingPrice?.Amount || priceData.Price.LandedPrice?.Amount,
                    currency: priceData.Price.ListingPrice?.CurrencyCode,
                    numberOfOffers: product.competitivePricing?.NumberOfOfferListings?.find(
                      (l: any) => l.condition === 'New'
                    )?.Count || 0,
                    salesRankings: product.salesRankings
                  };
                }
              });
            });

            // Process each ASIN in this batch
            const pricingEntries = Array.from(pricingByAsin.entries());
            for (const [asin, marketplacePrices] of pricingEntries) {
              const product = products.find(p => p.asin === asin);
              
              if (!product || !marketplacePrices.UK) {
                processedCount++;
                continue;
              }

              const ukPrice = marketplacePrices.UK.price;
              const ukCompetitors = marketplacePrices.UK.numberOfOffers;
              const ukSalesRank = marketplacePrices.UK.salesRankings?.[0]?.rank || 0;

              try {
                // Ensure minimum interval between fees requests (1 request per second)
                const now = Date.now();
                const timeSinceLastFeesRequest = now - lastFeesRequest;
                if (timeSinceLastFeesRequest < feesMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, feesMinInterval - timeSinceLastFeesRequest));
                }
                lastFeesRequest = Date.now();
                
                // Calculate fees with rate limiting protection
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
                  
                  const referralFee = feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee.amount || 0;
                  const amazonFees = fees.totalFeesEstimate?.amount || 0;
                  
                  // Extract ALL individual fees from SP-API response
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
                  const digitalServicesFeeFromAPI = feeDetails.find(f => 
                    f.feeType === 'DigitalServicesFee' || 
                    f.feeType === 'DigitalServiceTax' ||
                    f.feeType === 'DST'
                  )?.finalFee.amount;
                  
                  // Calculate DST as 2% of Amazon fees if not returned by API
                  digitalServicesFee = digitalServicesFeeFromAPI || (amazonFees * 0.02);
                  
                  // VAT calculations
                  const vatRate = 0.20; // UK VAT rate
                  const vatOnSale = ukPrice / (1 + vatRate) * vatRate; // VAT portion of sale price (~£25.82 for £154.94)
                  const vatOnCostOfGoods = 0; // Usually no VAT on EU purchases (reverse charge)

                  // Check EU prices
                  const euPrices: any[] = [];
                  let bestOpportunity: any = null;

                  for (const [country, data] of Object.entries(marketplacePrices)) {
                    if (country === 'UK' || !data) continue;
                    
                    const priceData = data as any;
                    const sourcePrice = priceData.price;
                    const sourcePriceGBP = priceData.currency === 'EUR' 
                      ? sourcePrice * EUR_TO_GBP_RATE 
                      : sourcePrice;

                    // Calculate profit using the net sale price (after VAT)
                    // Net Revenue = Sale Price - VAT on Sale
                    const netRevenue = ukPrice - vatOnSale;
                    
                    // Total Costs = Cost of Goods + Amazon Fees + Digital Services Fee
                    const totalCosts = sourcePriceGBP + amazonFees + digitalServicesFee;
                    
                    // Net Profit = Net Revenue - Total Costs
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

                    if (profit > 0 && (!bestOpportunity || roi > bestOpportunity.roi)) {
                      bestOpportunity = marketplacePrice;
                    }
                  }

                  // If profitable, save and send opportunity
                  if (bestOpportunity && bestOpportunity.profit > 0) {
                    opportunitiesFound++;
                    
                    // Save opportunity to database
                    if (scanId) {
                      await supabase
                        .from('arbitrage_opportunities')
                        .insert({
                          scan_id: scanId,
                          asin,
                          product_name: product.product_name || asin,
                          product_image: product.image_link || '',
                          target_price: ukPrice,
                          amazon_fees: amazonFees,
                          referral_fee: referralFee,
                          digital_services_fee: 0, // Included in total amazon_fees from SP-API
                          uk_competitors: ukCompetitors,
                          uk_sales_rank: ukSalesRank,
                          best_source_marketplace: bestOpportunity.marketplace,
                          best_source_price: bestOpportunity.sourcePrice,
                          best_source_price_gbp: bestOpportunity.sourcePriceGBP,
                          best_profit: bestOpportunity.profit,
                          best_roi: bestOpportunity.roi,
                          all_marketplace_prices: { euPrices },
                          storefronts: [{ 
                            id: storefront.id, 
                            name: storefront.name, 
                            seller_id: storefront.seller_id 
                          }]
                        });
                    }
                    
                    // Ensure netRevenue is calculated
                    const netRevenue = ukPrice - vatOnSale;
                    
                    const opportunity = {
                      asin,
                      productName: product.product_name || asin,
                      productImage: product.image_link || '',
                      targetPrice: ukPrice,
                      amazonFees,
                      referralFee,
                      fbaFee,
                      digitalServicesFee,
                      vatOnSale,
                      netRevenue,
                      ukCompetitors,
                      ukSalesRank,
                      euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                      bestOpportunity
                    };

                    sendMessage({ 
                      type: 'opportunity', 
                      data: opportunity 
                    });
                  }
                }
              } catch (feeError: any) {
                // Handle rate limiting with proper retry
                if (feeError.message?.includes('429') || feeError.message?.includes('QuotaExceeded') || feeError.message?.includes('TooManyRequests')) {
                  console.log(`Rate limited for ${asin} fees, waiting 5s before retry...`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  
                  // Retry once with backoff
                  try {
                    // Wait again to ensure we respect rate limit
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
                    
                    // If retry succeeded, process the fees
                    if (retryFeesEstimate.status === 'Success' && retryFeesEstimate.feesEstimate) {
                      const fees = retryFeesEstimate.feesEstimate;
                      const feeDetails = fees.feeDetailList || [];
                      
                      // Extract individual fees
                      let referralFee = 0;
                      let fbaFulfillmentFee = 0;
                      let variableClosingFee = 0;
                      let otherFees = 0;
                      
                      for (const fee of feeDetails) {
                        const feeAmount = fee.finalFee.amount;
                        switch (fee.feeType) {
                          case 'ReferralFee':
                            referralFee = feeAmount;
                            break;
                          case 'FBAFees':
                          case 'FulfillmentFees':
                          case 'FBAPerUnitFulfillmentFee':
                          case 'FBAPerOrderFulfillmentFee':
                            fbaFulfillmentFee += feeAmount;
                            break;
                          case 'VariableClosingFee':
                            variableClosingFee = feeAmount;
                            break;
                          case 'PerItemFee':
                          case 'FixedClosingFee':
                            otherFees += feeAmount;
                            break;
                          default:
                            otherFees += feeAmount;
                        }
                      }
                      
                      // Use the total fees from SP-API
                      const amazonFees = fees.totalFeesEstimate?.amount || 0;
                      
                      // Extract digital services fee if available
                      const digitalServicesFeeFromAPI = feeDetails.find(f => 
                        f.feeType === 'DigitalServicesFee' || 
                        f.feeType === 'DigitalServiceTax' ||
                        f.feeType === 'DST'
                      )?.finalFee.amount;
                      
                      const digitalServicesFee = digitalServicesFeeFromAPI || (amazonFees * 0.02);
                      
                      // VAT calculations
                      const vatRate = 0.20;
                      const vatOnSale = ukPrice / (1 + vatRate) * vatRate;
                      const netRevenue = ukPrice - vatOnSale;

                      // Process EU prices
                      const euPrices: any[] = [];
                      let bestOpportunity: any = null;

                      for (const [country, data] of Object.entries(marketplacePrices)) {
                        if (country === 'UK' || !data) continue;
                        
                        const priceData = data as any;
                        const sourcePrice = priceData.price;
                        const sourcePriceGBP = priceData.currency === 'EUR' 
                          ? sourcePrice * EUR_TO_GBP_RATE 
                          : sourcePrice;

                        // Calculate profit using the net sale price (after VAT)
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

                        if (profit > 0 && (!bestOpportunity || roi > bestOpportunity.roi)) {
                          bestOpportunity = marketplacePrice;
                        }
                      }

                      // If profitable, send opportunity
                      if (bestOpportunity && bestOpportunity.profit > 0) {
                        opportunitiesFound++;
                        
                        const opportunity = {
                          asin,
                          productName: product.product_name || asin,
                          productImage: product.image_link || '',
                          targetPrice: ukPrice,
                          amazonFees,
                          referralFee,
                          fbaFee: fbaFulfillmentFee,
                          digitalServicesFee,
                          vatOnSale,
                          netRevenue,
                          ukCompetitors,
                          ukSalesRank,
                          euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                          bestOpportunity
                        };

                        sendMessage({ 
                          type: 'opportunity', 
                          data: opportunity 
                        });
                      }
                    }
                  } catch (retryError) {
                    console.log(`Retry failed for ${asin}, skipping...`);
                  }
                } else {
                  console.error(`Fee calculation error for ${asin}:`, feeError);
                }
              }

              processedCount++;
              
              // Update progress every 5 products for smooth updates
              if (processedCount % 5 === 0 || processedCount === products.length) {
                const progress = 20 + (processedCount / products.length) * 70;
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: `Analyzed ${processedCount}/${products.length} products, found ${opportunitiesFound} opportunities`, 
                    progress 
                  } 
                });
              }
            }

            // Smart delay between batches based on processing time and rate limits
            const batchEndTime = Date.now();
            const batchStartTime = batchEndTime - (batch.length * feesMinInterval); // Approximate batch start
            const batchDuration = batchEndTime - batchStartTime;
            
            // Calculate minimum time this batch should have taken
            const minBatchDuration = Math.max(
              batch.length * feesMinInterval, // Fee API constraint (1 req/sec)
              (Object.keys(MARKETPLACES).length * pricingMinInterval) // Pricing API constraint (2 sec per marketplace)
            );
            
            // If we processed too fast, add delay
            if (batchDuration < minBatchDuration) {
              const additionalDelay = minBatchDuration - batchDuration;
              console.log(`Batch processed in ${batchDuration}ms, adding ${additionalDelay}ms delay`);
              await new Promise(resolve => setTimeout(resolve, additionalDelay));
            }
            
            // Extra safety margin for large datasets
            if (products.length > 200) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2s for safety
            }

          } catch (batchError) {
            console.error('Batch processing error:', batchError);
          }
        }

        // Update scan record with completion status
        if (scanId) {
          await supabase
            .from('arbitrage_scans')
            .update({
              status: 'completed',
              total_products: products.length,
              unique_asins: products.length, // For single storefront, all are unique
              opportunities_found: opportunitiesFound,
              completed_at: new Date().toISOString()
            })
            .eq('id', scanId);
        }

        sendMessage({ 
          type: 'complete', 
          data: { 
            totalProducts: products.length,
            opportunitiesFound,
            message: `Analysis complete! Analysed all ${products.length} products and found ${opportunitiesFound} profitable opportunities.`,
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
      endpoint: '/api/arbitrage/analyze-stream',
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
}