import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { checkEnvVars } from '@/lib/env-check';

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
  // Check required environment variables
  const envCheck = checkEnvVars({
    supabase: { url: true, serviceKey: true },
    aws: { accessKeyId: true, secretAccessKey: true },
    amazon: { accessKeyId: true, secretAccessKey: true, refreshToken: true, marketplaceId: true }
  });

  if (!envCheck.success) {
    return NextResponse.json(
      { error: 'Server configuration error', details: 'Missing required environment variables' },
      { status: 500 }
    );
  }

  const supabase = createClient(
    envCheck.values.supabaseUrl,
    envCheck.values.supabaseServiceKey
  );
  
  // Verify authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { storefrontId } = await request.json();
  
  if (!storefrontId) {
    return NextResponse.json({ error: 'Storefront ID is required' }, { status: 400 });
  }

  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const sendMessage = (message: StreamMessage) => {
        const data = `data: ${JSON.stringify(message)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      };

      try {
        sendMessage({ type: 'progress', data: { step: 'Fetching products...', progress: 0 } });

        // Fetch products
        const { data: storefront } = await supabase
          .from('storefronts')
          .select('*')
          .eq('id', storefrontId)
          .single();
          
        if (!storefront) {
          sendMessage({ type: 'error', data: { error: 'Storefront not found' } });
          return;
        }

        // First get the total count
        const { count: totalCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('storefront_id', storefrontId);
        
        sendMessage({ 
          type: 'progress', 
          data: { step: `Fetching ${totalCount} products...`, progress: 5 } 
        });

        // Fetch all products without limit
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .eq('storefront_id', storefrontId)
          .order('created_at', { ascending: false });

        if (!products || products.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No products found' } });
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
        const pricingMinInterval = 1000 / RATE_LIMITS.COMPETITIVE_PRICING.requestsPerSecond; // 100ms
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
                  const digitalServicesFee = ukPrice * 0.02;

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

                    const totalCost = sourcePriceGBP + amazonFees + digitalServicesFee;
                    const profit = ukPrice - totalCost;
                    const roi = (profit / sourcePriceGBP) * 100;

                    const marketplacePrice = {
                      marketplace: country,
                      sourcePrice,
                      sourcePriceGBP,
                      profit,
                      roi,
                      totalCost
                    };

                    euPrices.push(marketplacePrice);

                    if (profit > 0 && (!bestOpportunity || roi > bestOpportunity.roi)) {
                      bestOpportunity = marketplacePrice;
                    }
                  }

                  // If profitable, send opportunity immediately
                  if (bestOpportunity && bestOpportunity.profit > 0) {
                    opportunitiesFound++;
                    
                    const opportunity = {
                      asin,
                      productName: product.product_name || asin,
                      productImage: product.image_link || '',
                      targetPrice: ukPrice,
                      amazonFees,
                      referralFee,
                      digitalServicesFee,
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
                      
                      const referralFee = feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee.amount || 0;
                      const amazonFees = fees.totalFeesEstimate?.amount || 0;
                      const digitalServicesFee = ukPrice * 0.02;

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

                        const totalCost = sourcePriceGBP + amazonFees + digitalServicesFee;
                        const profit = ukPrice - totalCost;
                        const roi = (profit / sourcePriceGBP) * 100;

                        const marketplacePrice = {
                          marketplace: country,
                          sourcePrice,
                          sourcePriceGBP,
                          profit,
                          roi,
                          totalCost
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
                          digitalServicesFee,
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
              (Object.keys(MARKETPLACES).length * pricingMinInterval) // Pricing API constraint
            );
            
            // If we processed too fast, add delay
            if (batchDuration < minBatchDuration) {
              const additionalDelay = minBatchDuration - batchDuration;
              console.log(`Batch processed in ${batchDuration}ms, adding ${additionalDelay}ms delay`);
              await new Promise(resolve => setTimeout(resolve, additionalDelay));
            }
            
            // Extra safety margin for large datasets
            if (products.length > 200) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

          } catch (batchError) {
            console.error('Batch processing error:', batchError);
          }
        }

        sendMessage({ 
          type: 'complete', 
          data: { 
            totalProducts: products.length,
            opportunitiesFound,
            message: `Analysis complete! Analyzed all ${products.length} products and found ${opportunitiesFound} profitable opportunities.`
          } 
        });

      } catch (error: any) {
        console.error('Streaming analysis error:', error);
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
}