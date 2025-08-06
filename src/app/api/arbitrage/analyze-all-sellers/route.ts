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
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Found ${uniqueProducts.length} unique ASINs. Checking blacklist...`, 
            progress: 13 
          } 
        });

        // Filter out blacklisted ASINs
        const blacklistService = new BlacklistService(
          envCheck.values.supabaseUrl,
          envCheck.values.supabaseServiceKey
        );
        
        const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
        const { filteredProducts, excludedCount } = blacklistService.filterBlacklistedProducts(
          uniqueProducts,
          blacklistedAsins
        );

        if (excludedCount > 0) {
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Excluded ${excludedCount} blacklisted ASINs. Proceeding with ${filteredProducts.length} unique ASINs...`, 
              progress: 14,
              excludedCount,
              blacklistedCount: blacklistedAsins.size
            } 
          });
        }

        // Use filtered products for the rest of the analysis
        const finalUniqueProducts = filteredProducts;
        
        if (finalUniqueProducts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'All ASINs are blacklisted. Please remove some ASINs from blacklist or add more storefronts.' } });
          
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
                  blacklisted_asins_count: blacklistedAsins.size,
                  original_unique_asins: uniqueProducts.length
                }
              })
              .eq('id', scanId);
          }
          
          return;
        }
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Analyzing ${finalUniqueProducts.length} unique ASINs (from ${allProducts.length} total products across ${storefronts.length} storefronts)...`, 
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
        const batchSize = Math.min(20, finalUniqueProducts.length > 100 ? 10 : 15);
        
        // Rate limiter helper (EXACT SAME AS SINGLE SELLER)
        let lastPricingRequest = Date.now();
        let lastFeesRequest = Date.now();
        const pricingMinInterval = 2000; // 2 seconds between pricing requests
        const feesMinInterval = 1000 / RATE_LIMITS.PRODUCT_FEES.requestsPerSecond; // 1000ms
        let processedCount = 0;
        let opportunitiesFound = 0;

        for (let i = 0; i < finalUniqueProducts.length; i += batchSize) {
          const batch = finalUniqueProducts.slice(i, i + batchSize);
          const asins = batch.map(p => p.asin);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalUniqueProducts.length/batchSize)}...`, 
              progress: 20 + (i / finalUniqueProducts.length) * 60 
            } 
          });

          try {
            // Fetch pricing for all marketplaces SEQUENTIALLY (no parallel requests)
            const allPricing = [];
            
            for (const [country, marketplace] of Object.entries(MARKETPLACES)) {
              try {
                // Ensure minimum interval between pricing requests (2 seconds)
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
                allPricing.push({ country, pricing });
              } catch (error: any) {
                if (error.message?.includes('429') || error.message?.includes('TooManyRequests')) {
                  console.log(`Rate limited for ${country} pricing, waiting 5s...`);
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  // Retry once
                  try {
                    const pricing = await pricingClient.getCompetitivePricing(
                      asins,
                      marketplace.id,
                      'Asin',
                      'Consumer'
                    );
                    allPricing.push({ country, pricing });
                  } catch (retryError) {
                    console.error(`Retry failed for ${country}:`, retryError);
                    allPricing.push({ country, pricing: [] });
                  }
                } else {
                  console.error(`Error fetching pricing for ${country}:`, error);
                  allPricing.push({ country, pricing: [] });
                }
              }
            }
            
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
              const product = finalUniqueProducts.find(p => p.asin === asin);
              
              if (!product || !marketplacePrices.UK) {
                processedCount++;
                continue;
              }

              const ukPrice = marketplacePrices.UK.price;
              const ukCompetitors = marketplacePrices.UK.numberOfOffers;
              // Use sales rank from database first, fallback to SP-API data
              const ukSalesRank = product.current_sales_rank || marketplacePrices.UK.salesRankings?.[0]?.rank || 0;
              // Calculate sales per month if not available in database
              const salesPerMonth = product.sales_per_month || (ukSalesRank > 0 ? estimateMonthlySalesFromRank(ukSalesRank) : 0);

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

                    if (!bestOpportunity || roi > bestOpportunity.roi) {
                      bestOpportunity = marketplacePrice;
                    }
                  }

                  // Save ALL deals (profitable, break-even, and loss-making)
                  if (bestOpportunity) {
                    const profitCategory = categorizeProfitLevel(bestOpportunity.profit);
                    
                    // Only count as "opportunity" if profitable (for backward compatibility)
                    if (bestOpportunity.profit > 0) {
                      opportunitiesFound++;
                    }
                    
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
                          profit_category: profitCategory,
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
                      profitCategory,
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
              if (processedCount % 5 === 0 || processedCount === finalUniqueProducts.length) {
                const progress = 20 + (processedCount / finalUniqueProducts.length) * 70;
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: `Analyzed ${processedCount}/${finalUniqueProducts.length} unique ASINs, found ${opportunitiesFound} opportunities`, 
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
              unique_asins: finalUniqueProducts.length,
              opportunities_found: opportunitiesFound,
              completed_at: new Date().toISOString(),
              metadata: {
                ...scan.metadata,
                excluded_asins: excludedCount,
                blacklisted_asins_count: blacklistedAsins.size,
                original_unique_asins: uniqueProducts.length
              }
            })
            .eq('id', scanId);
        }

        const completionMessage = excludedCount > 0
          ? `Analysis complete! Analyzed ${finalUniqueProducts.length} unique ASINs (${excludedCount} blacklisted ASINs excluded) from ${allProducts.length} total products across ${storefronts.length} storefronts. Found ${opportunitiesFound} profitable opportunities.`
          : `Analysis complete! Analyzed ${finalUniqueProducts.length} unique ASINs from ${allProducts.length} total products across ${storefronts.length} storefronts. Found ${opportunitiesFound} profitable opportunities.`;

        sendMessage({ 
          type: 'complete', 
          data: { 
            totalProducts: allProducts.length,
            uniqueAsins: finalUniqueProducts.length,
            excludedCount,
            storefrontsAnalyzed: storefronts.length,
            opportunitiesFound,
            message: completionMessage,
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