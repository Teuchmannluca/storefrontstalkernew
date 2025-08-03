import 'reflect-metadata';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkEnvVars } from '@/lib/env-check';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';

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
  }
};

interface StreamMessage {
  type: 'progress' | 'opportunity' | 'complete' | 'error';
  data: any;
}

interface UniqueProduct {
  asin: string;
  product_name: string;
  image_link: string;
  storefronts: Array<{
    id: string;
    name: string;
    seller_id: string;
  }>;
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

        // Fetch all storefronts for the user
        const { data: storefronts, error: storefrontError } = await supabase
          .from('storefronts')
          .select('*')
          .eq('user_id', user.id)
          .order('name');
          
        if (storefrontError || !storefronts || storefronts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No storefronts found' } });
          return;
        }

        // Create scan record for all sellers
        const { data: scan, error: scanError } = await supabase
          .from('arbitrage_scans')
          .insert({
            user_id: user.id,
            scan_type: 'all_storefronts',
            storefront_name: `All Storefronts (${storefronts.length})`,
            status: 'running',
            metadata: {
              exchange_rate: EUR_TO_GBP_RATE,
              marketplaces: Object.keys(MARKETPLACES),
              storefronts_count: storefronts.length
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

        sendMessage({ 
          type: 'progress', 
          data: { step: `Found ${storefronts.length} storefronts. Fetching products...`, progress: 5, scanId } 
        });

        // Fetch all products from all storefronts
        const { data: allProducts, error: productsError } = await supabase
          .from('products')
          .select('*, storefronts!inner(id, name, seller_id)')
          .in('storefront_id', storefronts.map(s => s.id))
          .order('asin');

        if (productsError || !allProducts || allProducts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No products found across storefronts' } });
          return;
        }

        sendMessage({ 
          type: 'progress', 
          data: { step: `Found ${allProducts.length} total products. Deduplicating ASINs...`, progress: 10 } 
        });

        // Deduplicate ASINs and track which storefronts have each ASIN
        const uniqueProductsMap = new Map<string, UniqueProduct>();
        
        for (const product of allProducts) {
          const storefront = product.storefronts;
          
          if (uniqueProductsMap.has(product.asin)) {
            // Add this storefront to the existing ASIN
            const existing = uniqueProductsMap.get(product.asin)!;
            existing.storefronts.push({
              id: storefront.id,
              name: storefront.name,
              seller_id: storefront.seller_id
            });
          } else {
            // New ASIN
            uniqueProductsMap.set(product.asin, {
              asin: product.asin,
              product_name: product.product_name || product.asin,
              image_link: product.image_link || '',
              storefronts: [{
                id: storefront.id,
                name: storefront.name,
                seller_id: storefront.seller_id
              }]
            });
          }
        }

        const uniqueProducts = Array.from(uniqueProductsMap.values());
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Analyzing ${uniqueProducts.length} unique ASINs (from ${allProducts.length} total products across ${storefronts.length} storefronts)...`, 
            progress: 15 
          } 
        });

        // Initialize SP-API clients (same as single seller route)
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

        // Process products in batches (EXACT SAME AS SINGLE SELLER)
        const batchSize = Math.min(20, uniqueProducts.length > 100 ? 10 : 15);
        
        // Rate limiter helper (EXACT SAME AS SINGLE SELLER)
        let lastPricingRequest = Date.now();
        let lastFeesRequest = Date.now();
        const pricingMinInterval = 2000; // 2 seconds between pricing requests
        const feesMinInterval = 1000 / RATE_LIMITS.PRODUCT_FEES.requestsPerSecond; // 1000ms
        let processedCount = 0;
        let opportunitiesFound = 0;

        for (let i = 0; i < uniqueProducts.length; i += batchSize) {
          const batch = uniqueProducts.slice(i, i + batchSize);
          const asins = batch.map(p => p.asin);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueProducts.length/batchSize)}...`, 
              progress: 20 + (i / uniqueProducts.length) * 60 
            } 
          });

          try {
            // Fetch pricing for all marketplaces (EXACT SAME AS SINGLE SELLER)
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
            
            // Organize pricing data by ASIN (EXACT SAME AS SINGLE SELLER)
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

            // Process each ASIN in this batch (EXACT SAME AS SINGLE SELLER)
            const pricingEntries = Array.from(pricingByAsin.entries());
            for (const [asin, marketplacePrices] of pricingEntries) {
              const product = uniqueProducts.find(p => p.asin === asin);
              
              if (!product || !marketplacePrices.UK) {
                processedCount++;
                continue;
              }

              const ukPrice = marketplacePrices.UK.price;
              const ukCompetitors = marketplacePrices.UK.numberOfOffers;
              const ukSalesRank = marketplacePrices.UK.salesRankings?.[0]?.rank || 0;
              const salesPerMonth = 0; // Sales per month data not available

              try {
                // Ensure minimum interval between fees requests (EXACT SAME AS SINGLE SELLER)
                const now = Date.now();
                const timeSinceLastFeesRequest = now - lastFeesRequest;
                if (timeSinceLastFeesRequest < feesMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, feesMinInterval - timeSinceLastFeesRequest));
                }
                lastFeesRequest = Date.now();
                
                // Calculate fees (EXACT SAME AS SINGLE SELLER)
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
                  
                  const referralFee = feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee?.amount || 0;
                  const amazonFees = fees.totalFeesEstimate?.amount || 0;
                  const digitalServicesFee = amazonFees * 0.02; // 2% of Amazon fees

                  // Check EU prices (EXACT SAME AS SINGLE SELLER)
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
                          product_name: product.product_name,
                          product_image: product.image_link,
                          target_price: ukPrice,
                          amazon_fees: amazonFees,
                          referral_fee: referralFee,
                          digital_services_fee: digitalServicesFee,
                          uk_competitors: ukCompetitors,
                          uk_sales_rank: ukSalesRank,
                          sales_per_month: salesPerMonth,
                          best_source_marketplace: bestOpportunity.marketplace,
                          best_source_price: bestOpportunity.sourcePrice,
                          best_source_price_gbp: bestOpportunity.sourcePriceGBP,
                          best_profit: bestOpportunity.profit,
                          best_roi: bestOpportunity.roi,
                          all_marketplace_prices: { euPrices },
                          storefronts: product.storefronts
                        });
                    }
                    
                    const opportunity = {
                      asin,
                      productName: product.product_name,
                      productImage: product.image_link,
                      targetPrice: ukPrice,
                      amazonFees,
                      referralFee,
                      digitalServicesFee,
                      ukCompetitors,
                      ukSalesRank,
                      salesPerMonth,
                      euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                      bestOpportunity,
                      storefronts: product.storefronts
                    };

                    sendMessage({ 
                      type: 'opportunity', 
                      data: opportunity 
                    });
                  }
                }
              } catch (feeError: any) {
                // Handle rate limiting (EXACT SAME AS SINGLE SELLER)
                if (feeError.message?.includes('429') || feeError.message?.includes('QuotaExceeded') || feeError.message?.includes('TooManyRequests')) {
                  console.log(`Rate limited for ${asin} fees, waiting 5s before retry...`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  // Could add retry logic here if needed
                } else {
                  console.error(`Fee calculation error for ${asin}:`, feeError);
                }
              }

              processedCount++;
              
              // Update progress every 5 products
              if (processedCount % 5 === 0 || processedCount === uniqueProducts.length) {
                const progress = 20 + (processedCount / uniqueProducts.length) * 70;
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: `Analyzed ${processedCount}/${uniqueProducts.length} unique ASINs, found ${opportunitiesFound} opportunities`, 
                    progress 
                  } 
                });
              }
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
              total_products: allProducts.length,
              unique_asins: uniqueProducts.length,
              opportunities_found: opportunitiesFound,
              completed_at: new Date().toISOString()
            })
            .eq('id', scanId);
        }

        sendMessage({ 
          type: 'complete', 
          data: { 
            totalProducts: allProducts.length,
            uniqueAsins: uniqueProducts.length,
            storefrontsAnalyzed: storefronts.length,
            opportunitiesFound,
            message: `Analysis complete! Analyzed ${uniqueProducts.length} unique ASINs from ${allProducts.length} total products across ${storefronts.length} storefronts. Found ${opportunitiesFound} profitable opportunities.`,
            scanId
          } 
        });

      } catch (error: any) {
        console.error('Streaming analysis error:', error);
        
        // Update scan record with error status
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
}