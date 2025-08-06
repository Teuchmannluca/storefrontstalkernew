import 'reflect-metadata';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkEnvVars } from '@/lib/env-check';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
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
  current_sales_rank: number | null;
  sales_per_month: number | null;
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

  // Parse request body to get selected storefront IDs
  let selectedStorefrontIds: string[];
  try {
    const body = await request.json();
    selectedStorefrontIds = body.storefrontIds;
    
    if (!Array.isArray(selectedStorefrontIds) || selectedStorefrontIds.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty storefront IDs array' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
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

        // Fetch selected storefronts for the user
        const { data: storefronts, error: storefrontError } = await supabase
          .from('storefronts')
          .select('*')
          .eq('user_id', user.id)
          .in('id', selectedStorefrontIds)
          .order('name');
          
        if (storefrontError || !storefronts || storefronts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No selected storefronts found' } });
          return;
        }

        // Verify all requested storefronts were found
        if (storefronts.length !== selectedStorefrontIds.length) {
          const foundIds = storefronts.map(s => s.id);
          const missingIds = selectedStorefrontIds.filter(id => !foundIds.includes(id));
          console.warn(`Some storefront IDs not found: ${missingIds.join(', ')}`);
        }

        // Create scan record for selected storefronts
        const storefrontNames = storefronts.map(s => s.name).join(', ');
        const scanName = storefronts.length === 1 
          ? storefronts[0].name 
          : `${storefronts.length} Selected: ${storefrontNames.length > 50 ? storefrontNames.substring(0, 47) + '...' : storefrontNames}`;

        const { data: scan, error: scanError } = await supabase
          .from('arbitrage_scans')
          .insert({
            user_id: user.id,
            scan_type: 'selected_storefronts',
            storefront_name: scanName,
            status: 'running',
            metadata: {
              exchange_rate: EUR_TO_GBP_RATE,
              marketplaces: Object.keys(MARKETPLACES),
              storefronts_count: storefronts.length,
              selected_storefront_ids: selectedStorefrontIds
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
          data: { step: `Found ${storefronts.length} selected storefronts. Collecting products...`, progress: 5, scanId } 
        });

        // Fetch ALL products from SELECTED storefronts
        console.log(`Fetching products from ${storefronts.length} selected storefronts:`, storefronts.map(s => s.name));
        const { data: allProducts, error: productsError } = await supabase
          .from('products')
          .select(`
            *,
            storefronts (
              id,
              name,
              seller_id
            )
          `)
          .in('storefront_id', storefronts.map(s => s.id))
          .order('asin');

        console.log(`Query result: ${allProducts?.length || 0} products found`);

        if (productsError) {
          console.error('Products query error:', productsError);
          sendMessage({ type: 'error', data: { error: `Failed to fetch products: ${productsError.message}` } });
          return;
        }

        if (!allProducts || allProducts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No products found in selected storefronts. Please sync your storefronts first.' } });
          return;
        }

        // Add validation: check which storefronts have products
        const storefrontsWithProducts = new Set(allProducts.map(p => p.storefront_id));
        const emptyStorefronts = storefronts.filter(s => !storefrontsWithProducts.has(s.id));
        
        if (emptyStorefronts.length > 0) {
          console.log(`Warning: ${emptyStorefronts.length} selected storefronts have no products:`, emptyStorefronts.map(s => s.name));
        }

        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Found ${allProducts.length} total products from ${storefronts.length} selected storefronts. Deduplicating ASINs...`, 
            progress: 8,
            totalProducts: allProducts.length,
            storefrontsCount: storefronts.length
          } 
        });

        // Deduplicate ASINs and track which storefronts have each ASIN
        const uniqueProductsMap = new Map<string, UniqueProduct>();
        
        for (const product of allProducts) {
          const storefront = product.storefronts;
          
          if (!storefront) {
            console.warn(`Product ${product.asin} has no storefront data, skipping`);
            continue;
          }
          
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
              current_sales_rank: product.current_sales_rank,
              sales_per_month: product.sales_per_month,
              storefronts: [{
                id: storefront.id,
                name: storefront.name,
                seller_id: storefront.seller_id
              }]
            });
          }
        }

        const uniqueProducts = Array.from(uniqueProductsMap.values());
        
        console.log(`Deduplication complete: ${allProducts.length} total products -> ${uniqueProducts.length} unique ASINs`);
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Identified ${uniqueProducts.length} unique ASINs across selected storefronts. Applying blacklist filter...`, 
            progress: 12,
            uniqueAsins: uniqueProducts.length,
            totalProducts: allProducts.length
          } 
        });

        // Filter out blacklisted ASINs
        const blacklistService = new BlacklistService(
          envCheck.values.supabaseUrl,
          envCheck.values.supabaseServiceKey
        );
        
        console.log('Loading user blacklist...');
        const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
        console.log(`User has ${blacklistedAsins.size} blacklisted ASINs`);
        
        const { filteredProducts, excludedCount } = blacklistService.filterBlacklistedProducts(
          uniqueProducts,
          blacklistedAsins
        );

        console.log(`Blacklist filtering complete: ${uniqueProducts.length} ASINs -> ${filteredProducts.length} after filtering (${excludedCount} excluded)`);

        if (filteredProducts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'No products remaining after blacklist filtering.' } });
          return;
        }

        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `${filteredProducts.length} ASINs ready for analysis (${excludedCount} blacklisted). Starting marketplace pricing analysis...`, 
            progress: 15,
            uniqueAsins: uniqueProducts.length,
            excludedCount,
            blacklistedCount: excludedCount,
            finalAsinCount: filteredProducts.length
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

        const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
        const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);

        let processedCount = 0;
        let opportunityCount = 0;
        const batchSize = RATE_LIMITS.COMPETITIVE_PRICING.itemsPerRequest;
        const totalBatches = Math.ceil(filteredProducts.length / batchSize);

        // Process products in batches
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * batchSize;
          const batchEnd = Math.min(batchStart + batchSize, filteredProducts.length);
          const batch = filteredProducts.slice(batchStart, batchEnd);
          
          const batchProgress = Math.round(15 + (batchIndex / totalBatches) * 70);
          const remainingBatches = totalBatches - batchIndex;
          const estimatedMinutesRemaining = Math.ceil(remainingBatches * 1.2); // Rough estimate

          sendMessage({
            type: 'progress',
            data: {
              step: `Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} products)...`,
              progress: batchProgress,
              processedCount,
              totalProducts: filteredProducts.length,
              estimatedMinutesRemaining
            }
          });

          try {
            // Get pricing data for all EU marketplaces
            const asins = batch.map(p => p.asin);
            const marketplacePrices = new Map<string, any>();

            // Fetch pricing from all EU marketplaces SEQUENTIALLY (no parallel requests)
            const pricingResults = [];
            let lastPricingRequest = Date.now();
            const pricingMinInterval = 2000; // 2 seconds between requests
            
            for (const [countryCode, marketplace] of Object.entries(MARKETPLACES)) {
              try {
                // Ensure minimum interval between pricing requests
                const now = Date.now();
                const timeSinceLastRequest = now - lastPricingRequest;
                if (timeSinceLastRequest < pricingMinInterval) {
                  await new Promise(resolve => setTimeout(resolve, pricingMinInterval - timeSinceLastRequest));
                }
                lastPricingRequest = Date.now();
                
                const prices = await pricingClient.getCompetitivePricing(asins, marketplace.id);
                pricingResults.push({ countryCode, prices });
              } catch (error: any) {
                if (error.message?.includes('429') || error.message?.includes('TooManyRequests')) {
                  console.log(`Rate limited for ${countryCode} pricing, waiting 5s...`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  // Retry once
                  try {
                    const prices = await pricingClient.getCompetitivePricing(asins, marketplace.id);
                    pricingResults.push({ countryCode, prices });
                  } catch (retryError) {
                    console.error(`Retry failed for ${countryCode}:`, retryError);
                    pricingResults.push({ countryCode, prices: {} });
                  }
                } else {
                  console.error(`Error fetching pricing for ${countryCode}:`, error);
                  pricingResults.push({ countryCode, prices: {} });
                }
              }
            }
            pricingResults.forEach(({ countryCode, prices }) => {
              Object.entries(prices).forEach(([asin, priceData]) => {
                if (!marketplacePrices.has(asin)) {
                  marketplacePrices.set(asin, {});
                }
                marketplacePrices.get(asin)![countryCode] = priceData;
              });
            });

            // Process each product in the batch
            for (const product of batch) {
              try {
                const asinPrices = marketplacePrices.get(product.asin) || {};
                const ukPricing = asinPrices.UK;

                if (!ukPricing || !ukPricing.competitivePricing) {
                  processedCount++;
                  continue;
                }

                // Calculate fees for UK selling price
                const ukPrice = ukPricing.competitivePricing.competitivePrices?.[0]?.price?.amount;
                if (!ukPrice || ukPrice <= 0) {
                  processedCount++;
                  continue;
                }

                // Get fees estimate
                let amazonFees = 0;
                let referralFee = 0;
                let digitalServicesFee = 0;

                try {
                  const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
                    product.asin,
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
                    
                    amazonFees = fees.totalFeesEstimate?.amount || 0;
                    
                    // Extract referral fee specifically
                    const referralFeeDetail = feeDetails.find((fee: any) => fee.feeType === 'ReferralFee');
                    if (referralFeeDetail?.finalFee?.amount) {
                      referralFee = referralFeeDetail.finalFee.amount;
                    }
                  }

                  // Calculate 2% digital services fee
                  digitalServicesFee = ukPrice * 0.02;

                } catch (feeError) {
                  // Use fallback fee calculation if API fails
                  referralFee = ukPrice * 0.15; // 15% referral fee
                  amazonFees = referralFee + 3; // £3 FBA fee estimate
                  digitalServicesFee = ukPrice * 0.02;
                }

                // Find best EU opportunity
                let bestOpportunity: any = null;
                const euPrices: any[] = [];

                for (const [countryCode, marketplace] of Object.entries(MARKETPLACES)) {
                  if (countryCode === 'UK') continue;

                  const countryPricing = asinPrices[countryCode];
                  if (!countryPricing?.competitivePricing?.competitivePrices?.[0]?.price?.amount) {
                    continue;
                  }

                  const sourcePrice = countryPricing.competitivePricing.competitivePrices[0].price.amount;
                  const sourcePriceGBP = sourcePrice * EUR_TO_GBP_RATE;
                  const totalCost = sourcePriceGBP + amazonFees + digitalServicesFee;
                  const profit = ukPrice - totalCost;
                  const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                  const profitMargin = ukPrice > 0 ? (profit / ukPrice) * 100 : 0;

                  const opportunity = {
                    marketplace: countryCode,
                    sourcePrice,
                    sourcePriceGBP,
                    profit,
                    profitMargin,
                    roi,
                    totalCost
                  };

                  euPrices.push(opportunity);

                  if (!bestOpportunity || profit > bestOpportunity.profit) {
                    bestOpportunity = opportunity;
                  }
                }

                if (bestOpportunity && bestOpportunity.profit > -0.50) {
                  // Get sales data
                  let salesPerMonth = product.sales_per_month;
                  if (!salesPerMonth && product.current_sales_rank) {
                    salesPerMonth = estimateMonthlySalesFromRank(product.current_sales_rank);
                  }

                  // Categorize profit level
                  const profitCategory: ProfitCategory = categorizeProfitLevel(bestOpportunity.profit);

                  const opportunity = {
                    asin: product.asin,
                    product_name: product.product_name,
                    product_image: product.image_link,
                    target_price: ukPrice,
                    amazon_fees: amazonFees,
                    referral_fee: referralFee,
                    digital_services_fee: digitalServicesFee,
                    uk_competitors: ukPricing.competitivePricing.NumberOfOfferListings || 0,
                    uk_sales_rank: product.current_sales_rank,
                    best_source_marketplace: bestOpportunity.marketplace,
                    best_source_price: bestOpportunity.sourcePrice,
                    best_source_price_gbp: bestOpportunity.sourcePriceGBP,
                    best_profit: bestOpportunity.profit,
                    best_roi: bestOpportunity.roi,
                    sales_per_month: salesPerMonth,
                    all_marketplace_prices: { euPrices },
                    storefronts: product.storefronts,
                    profit_category: profitCategory,
                    scan_id: scanId
                  };

                  // Save opportunity to database
                  const { error: insertError } = await supabase
                    .from('arbitrage_opportunities')
                    .insert(opportunity);

                  if (!insertError) {
                    opportunityCount++;
                    sendMessage({ type: 'opportunity', data: opportunity });
                  }
                }

                processedCount++;

              } catch (productError) {
                console.error(`Error processing product ${product.asin}:`, productError);
                processedCount++;
              }

              // Rate limiting delay
              await new Promise(resolve => setTimeout(resolve, 100));
            }

          } catch (batchError) {
            console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
            processedCount += batch.length;
            continue;
          }

          // Batch delay for rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Update scan record with final results
        await supabase
          .from('arbitrage_scans')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            total_products: filteredProducts.length,
            unique_asins: uniqueProducts.length,
            opportunities_found: opportunityCount
          })
          .eq('id', scanId);

        sendMessage({
          type: 'complete',
          data: {
            scanId,
            totalOpportunities: opportunityCount,
            productsAnalyzed: processedCount,
            exchangeRate: EUR_TO_GBP_RATE,
            storefrontsCount: storefronts.length,
            uniqueAsins: uniqueProducts.length,
            excludedCount,
            finalAsinCount: filteredProducts.length
          }
        });

      } catch (error: any) {
        console.error('Analysis error:', error);
        
        // Update scan record with error
        if (scanId) {
          await supabase
            .from('arbitrage_scans')
            .update({
              status: 'error',
              completed_at: new Date().toISOString(),
              error_message: error.message
            })
            .eq('id', scanId);
        }

        sendMessage({
          type: 'error',
          data: { error: `Analysis failed: ${error.message}` }
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}