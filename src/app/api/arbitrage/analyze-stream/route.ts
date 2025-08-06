import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { checkEnvVars } from '@/lib/env-check';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { validateRequestBody, apiSchemas, ValidationError } from '@/lib/validation';
import { sendStreamError, AppError, ErrorCategory, MonitoredError } from '@/lib/error-handling';
import { BlacklistService } from '@/lib/blacklist-service';
import { categorizeProfitLevel, type ProfitCategory } from '@/lib/profit-categorizer';
import { estimateMonthlySalesFromRank } from '@/lib/sales-estimator';
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
// Competitive Pricing API: 0.5 requests per second (1 every 2 seconds), 20 items per request
// Product Fees API: 1 request per second
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

        sendMessage({ 
          type: 'progress', 
          data: { step: 'Checking blacklist...', progress: 8 } 
        });

        // Filter out blacklisted ASINs
        const blacklistService = new BlacklistService(
          envCheck.values.supabaseUrl,
          envCheck.values.supabaseServiceKey
        );
        
        const blacklistedAsins = await blacklistService.getBlacklistedAsins(user.id);
        const { filteredProducts, excludedCount } = blacklistService.filterBlacklistedProducts(
          products,
          blacklistedAsins
        );

        if (excludedCount > 0) {
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Excluded ${excludedCount} blacklisted ASINs. Proceeding with ${filteredProducts.length} products...`, 
              progress: 9,
              excludedCount,
              blacklistedCount: blacklistedAsins.size
            } 
          });
        }

        // Use filtered products for the rest of the analysis
        const finalProducts = filteredProducts;
        
        if (finalProducts.length === 0) {
          sendMessage({ type: 'error', data: { error: 'All products are blacklisted. Please remove some ASINs from blacklist or sync more products.' } });
          
          // Update scan status to failed
          if (scanId) {
            await supabase
              .from('arbitrage_scans')
              .update({
                status: 'failed',
                error_message: 'All products blacklisted',
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
        
        // Warning for very large storefronts
        if (finalProducts.length > 500) {
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `⚠️ Large storefront detected (${finalProducts.length} products). This analysis may take several minutes...`, 
              progress: 9 
            } 
          });
        }

        // Calculate estimated time based on rate limits
        // Each product needs: 5 pricing requests (one per marketplace) + 1 fee request
        // Pricing: 2 seconds between marketplace requests (to avoid bursts)
        // Fees: 1 request per second
        const estimatedSecondsPerProduct = 3; // Conservative estimate accounting for API delays
        const totalEstimatedSeconds = Math.ceil(finalProducts.length * estimatedSecondsPerProduct);
        const estimatedMinutes = Math.ceil(totalEstimatedSeconds / 60);
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Loaded ${finalProducts.length} products, starting EU pricing analysis...`, 
            progress: 10,
            totalProducts: finalProducts.length,
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

        const pricingClient = new SPAPICompetitivePricingClient(credentials, spApiConfig);
        const feesClient = new SPAPIProductFeesClient(credentials, spApiConfig);

        // Process products in batches respecting SP-API limits
        // Competitive Pricing API allows 20 items per request
        const batchSize = Math.min(20, finalProducts.length > 100 ? 10 : 15);
        
        // Rate limiter helper
        let lastPricingRequest = Date.now();
        let lastFeesRequest = Date.now();
        const pricingMinInterval = 2000; // 2 seconds between pricing requests to stay under quota
        const feesMinInterval = 1000 / RATE_LIMITS.PRODUCT_FEES.requestsPerSecond; // 1000ms
        let processedCount = 0;
        let opportunitiesFound = 0;

        for (let i = 0; i < finalProducts.length; i += batchSize) {
          // Log if client disconnected but continue processing
          if (isControllerClosed || abortController.signal.aborted) {
            console.log('[STREAM] Client disconnected, but continuing scan for database storage');
          }
          
          const batch = finalProducts.slice(i, i + batchSize);
          const asins = batch.map(p => p.asin);
          
          // Calculate time remaining for batch messages
          const remainingProductsAtBatch = finalProducts.length - i;
          const estimatedSecondsRemainingAtBatch = Math.ceil(remainingProductsAtBatch * estimatedSecondsPerProduct);
          const estimatedMinutesRemainingAtBatch = Math.ceil(estimatedSecondsRemainingAtBatch / 60);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(finalProducts.length/batchSize)}...`, 
              progress: 20 + (i / finalProducts.length) * 60,
              processedCount: i,
              totalProducts: finalProducts.length,
              estimatedMinutesRemaining: estimatedMinutesRemainingAtBatch
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
            
            // Organize pricing data by ASIN
            const pricingByAsin = new Map<string, any>();
            
            allPricing.forEach(({ country, pricing }) => {
              pricing.forEach((product: any) => {
                const asin = product.asin;
                if (!pricingByAsin.has(asin)) {
                  pricingByAsin.set(asin, {});
                }
                
                // SP-API returns CompetitivePrices array with different structure
                const competitivePrices = product.competitivePricing?.CompetitivePrices || [];
                
                // IMPORTANT: Filter out USED products - only consider NEW condition
                const newConditionPrices = competitivePrices.filter(
                  (cp: any) => cp.condition === 'New' || cp.condition === 'new' || !cp.condition
                );
                
                // Skip this product entirely if no NEW condition prices available
                if (newConditionPrices.length === 0) {
                  if (debug) {
                    console.log(`[DEBUG] Skipping ${asin} in ${country} - no NEW condition prices available`);
                  }
                  return; // Skip this product
                }
                
                // Look for buy box price first (CompetitivePriceId '1' is usually buy box) - NEW only
                let buyBoxPrice = newConditionPrices.find(
                  (cp: any) => cp.CompetitivePriceId === '1'
                );
                
                // If no buy box with '1', look for other competitive prices - NEW only
                let featuredPrice = newConditionPrices.find(
                  (cp: any) => cp.CompetitivePriceId === 'B2C' || cp.CompetitivePriceId === '2'
                );
                
                // Use buy box price preferentially, then featured price, then first available NEW item
                const priceData = buyBoxPrice || featuredPrice || newConditionPrices[0];
                
                if (priceData && priceData.Price) {
                  // Check both ListingPrice and LandedPrice structures
                  const listingPrice = priceData.Price.ListingPrice || priceData.Price.LandedPrice;
                  const price = listingPrice?.Amount;
                  const currency = listingPrice?.CurrencyCode;
                  
                  // Debug logging for pricing discrepancies
                  if (debug && asin === 'B01JUUHJF4') {
                    console.log(`[DEBUG] ${country} pricing for ${asin}:`, {
                      totalCompetitivePrices: competitivePrices.length,
                      newConditionPricesCount: newConditionPrices.length,
                      allPrices: competitivePrices.map((cp: any) => ({
                        id: cp.CompetitivePriceId,
                        price: cp.Price,
                        condition: cp.condition,
                        belongsToRequester: cp.belongsToRequester
                      })),
                      filteredNewPrices: newConditionPrices.map((cp: any) => ({
                        id: cp.CompetitivePriceId,
                        price: cp.Price,
                        condition: cp.condition
                      })),
                      selectedPrice: priceData,
                      finalPrice: price,
                      currency: currency
                    });
                  }
                  
                  if (price && currency) {
                    pricingByAsin.get(asin)[country] = {
                      price: price,
                      currency: currency,
                      priceType: buyBoxPrice ? 'buy_box' : (featuredPrice ? 'featured_offer' : 'first_available'),
                      competitivePriceId: priceData.CompetitivePriceId,
                      numberOfOffers: product.competitivePricing?.NumberOfOfferListings?.find(
                        (l: any) => l.condition === 'New'
                      )?.Count || 0,
                      salesRankings: product.salesRankings
                    };
                  }
                }
              });
            });

            // Process each ASIN in this batch
            const pricingEntries = Array.from(pricingByAsin.entries());
            for (const [asin, marketplacePrices] of pricingEntries) {
              // Continue processing even if client disconnected - we want to save results
              const product = finalProducts.find(p => p.asin === asin);
              
              if (!product || !marketplacePrices.UK) {
                processedCount++;
                continue;
              }

              const ukPrice = marketplacePrices.UK.price;
              
              // Skip products without valid UK pricing (might be USED only)
              if (!ukPrice || ukPrice <= 0) {
                if (debug) {
                  console.log(`[DEBUG] Skipping ${asin} - no valid UK NEW price available`);
                }
                processedCount++;
                continue;
              }
              
              // Check if we have at least one EU marketplace with valid NEW pricing
              const validEuMarketplaces = Object.entries(marketplacePrices)
                .filter(([country, data]) => 
                  country !== 'UK' && 
                  data && 
                  (data as any).price && 
                  (data as any).price > 0
                );
              
              if (validEuMarketplaces.length === 0) {
                if (debug) {
                  console.log(`[DEBUG] Skipping ${asin} - no valid EU NEW prices available`);
                }
                processedCount++;
                continue;
              }
              const ukCompetitors = marketplacePrices.UK.numberOfOffers;
              // Use sales rank from database first, fallback to SP-API data
              const ukSalesRank = product.current_sales_rank || marketplacePrices.UK.salesRankings?.[0]?.rank || 0;
              // Calculate sales per month if not available in database
              const salesPerMonth = product.sales_per_month || (ukSalesRank > 0 ? estimateMonthlySalesFromRank(ukSalesRank) : 0);

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
                    
                    // Always save opportunity to database first (even if client disconnected)
                    if (scanId) {
                      try {
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
                            sales_per_month: salesPerMonth,
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
                      } catch (dbError) {
                        console.error('[DB] Failed to save opportunity:', dbError);
                        // Continue processing even if individual opportunity save fails
                      }
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
                      salesPerMonth,
                      euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                      bestOpportunity
                    };

                    // Only send message if client is still connected
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
                        
                        // Always save to database first (even if client disconnected)
                        if (scanId) {
                          try {
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
                                sales_per_month: salesPerMonth,
                                best_source_marketplace: bestOpportunity.marketplace,
                                best_source_price: bestOpportunity.sourcePrice,
                                best_source_price_gbp: bestOpportunity.sourcePriceGBP,
                                best_profit: bestOpportunity.profit,
                                best_roi: bestOpportunity.roi,
                                profit_category: profitCategory,
                                all_marketplace_prices: { euPrices },
                                storefronts: [{ 
                                  id: storefront.id, 
                                  name: storefront.name, 
                                  seller_id: storefront.seller_id 
                                }]
                              });
                          } catch (dbError) {
                            console.error('[DB] Failed to save opportunity (retry):', dbError);
                          }
                        }
                        
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
                          salesPerMonth,
                          euPrices: euPrices.sort((a, b) => b.roi - a.roi),
                          bestOpportunity,
                          profitCategory
                        };

                        // Only send message if client is still connected
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
              if (processedCount % 5 === 0 || processedCount === finalProducts.length) {
                const progress = 20 + (processedCount / finalProducts.length) * 70;
                
                // Calculate time remaining
                const remainingProducts = finalProducts.length - processedCount;
                const estimatedSecondsRemaining = Math.ceil(remainingProducts * estimatedSecondsPerProduct);
                const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);
                
                sendMessage({ 
                  type: 'progress', 
                  data: { 
                    step: `Analyzed ${processedCount}/${finalProducts.length} products, found ${opportunitiesFound} opportunities`, 
                    progress,
                    processedCount,
                    totalProducts: finalProducts.length,
                    opportunitiesFound,
                    estimatedMinutesRemaining
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
            if (finalProducts.length > 200) {
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
              total_products: finalProducts.length,
              unique_asins: finalProducts.length, // For single storefront, all are unique
              opportunities_found: opportunitiesFound,
              completed_at: new Date().toISOString(),
              metadata: {
                ...scan.metadata,
                excluded_asins: excludedCount,
                blacklisted_asins_count: blacklistedAsins.size,
                original_product_count: products.length
              }
            })
            .eq('id', scanId);
        }

        const completionMessage = excludedCount > 0
          ? `Analysis complete! Analysed ${finalProducts.length} products (${excludedCount} blacklisted ASINs excluded) and found ${opportunitiesFound} profitable opportunities.`
          : `Analysis complete! Analysed all ${finalProducts.length} products and found ${opportunitiesFound} profitable opportunities.`;

        // Send scan complete notification for all scans (regardless of results)
        if (scanId) {
          try {
            // Get all opportunities (including non-profitable ones)
            const { data: allOpportunities } = await supabase
              .from('arbitrage_opportunities')
              .select('best_profit, best_roi')
              .eq('scan_id', scanId)
              .order('best_profit', { ascending: false });

            // Calculate actual profitable count (best_profit > 0)
            const actualProfitableCount = allOpportunities?.filter(opp => (opp.best_profit || 0) > 0).length || 0;
            
            // Get best profitable deal
            const bestDeal = allOpportunities?.find(opp => (opp.best_profit || 0) > 0) || allOpportunities?.[0];
            
            // Calculate total profit from profitable deals only
            const totalProfit = allOpportunities
              ?.filter(opp => (opp.best_profit || 0) > 0)
              ?.reduce((sum, opp) => sum + (opp.best_profit || 0), 0) || 0;

            await notificationService.sendNotification({
              userId: user.id,
              type: 'scan_complete',
              data: {
                scanType: storefrontId ? 'Single Storefront' : 'All Storefronts',
                productsAnalyzed: finalProducts.length,
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
            totalProducts: finalProducts.length,
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
      endpoint: '/api/arbitrage/analyze-stream',
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
}