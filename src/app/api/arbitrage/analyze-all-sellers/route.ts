import 'reflect-metadata';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkEnvVars } from '@/lib/env-check';
import type { IExternalPricingService } from '@/domain/interfaces/IExternalPricingService';
import { ResilientPricingAdapter } from '@/infrastructure/external-apis/ResilientPricingAdapter';
import { ResilientSPAPIClient } from '@/infrastructure/sp-api/ResilientSPAPIClient';
import { InMemoryCacheService } from '@/infrastructure/cache/InMemoryCacheService';

// Marketplace IDs
const MARKETPLACES = {
  UK: { id: 'A1F83G8C2ARO7P', currency: 'GBP', region: 'eu' },
  DE: { id: 'A1PA6795UKMFR9', currency: 'EUR', region: 'eu' },
  FR: { id: 'A13V1IB3VIYZZH', currency: 'EUR', region: 'eu' },
  IT: { id: 'APJ6JRA9NG5V4', currency: 'EUR', region: 'eu' },
  ES: { id: 'A1RKKUPIHCS9HS', currency: 'EUR', region: 'eu' }
};

const EUR_TO_GBP_RATE = 0.86;

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

  // Create pricing service instances
  const cacheService = new InMemoryCacheService();
  const spApiClient = new ResilientSPAPIClient(cacheService);
  const pricingService: IExternalPricingService = new ResilientPricingAdapter(spApiClient);

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

        // Process unique products in batches of 10 for optimal performance
        const batchSize = 10;
        let processedCount = 0;
        let opportunitiesFound = 0;
        const totalProducts = uniqueProducts.length;

        for (let i = 0; i < uniqueProducts.length; i += batchSize) {
          const batch = uniqueProducts.slice(i, i + batchSize);
          const asins = batch.map(p => p.asin);
          
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueProducts.length/batchSize)} (${batch.length} ASINs)...`, 
              progress: 20 + (i / uniqueProducts.length) * 60 
            } 
          });

          try {
            // Step 1: Get UK pricing for this batch
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Fetching UK pricing for batch ${Math.floor(i/batchSize) + 1}...`, 
                progress: 20 + (i / uniqueProducts.length) * 60 
              } 
            });
            
            const ukPricing = await pricingService.getCompetitivePricing(
              asins,
              MARKETPLACES.UK.id
            );

            // Step 2: Get fees for products with UK pricing
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Calculating fees for batch ${Math.floor(i/batchSize) + 1}...`, 
                progress: 20 + ((i + 0.3) / uniqueProducts.length) * 60 
              } 
            });
            
            const productsWithPricing = [];
            for (const product of batch) {
              const ukPriceData = ukPricing.get(product.asin);
              if (ukPriceData && ukPriceData.price) {
                productsWithPricing.push({
                  ...product,
                  ukPrice: ukPriceData.price,
                  ukCompetitors: ukPriceData.numberOfOffers || 0,
                  ukSalesRank: ukPriceData.salesRankings?.[0]?.rank || 0
                });
              }
            }

            const feesPromises = productsWithPricing.map(async (product) => {
              try {
                const fees = await pricingService.getFeesEstimate(
                  product.asin,
                  product.ukPrice,
                  MARKETPLACES.UK.id
                );
                return { product, fees };
              } catch (error) {
                console.error(`Fee error for ${product.asin}:`, error);
                return { product, fees: null };
              }
            });

            const feesResults = await Promise.all(feesPromises);

            // Step 3: Get EU pricing for this batch
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Fetching EU pricing for batch ${Math.floor(i/batchSize) + 1}...`, 
                progress: 20 + ((i + 0.6) / uniqueProducts.length) * 60 
              } 
            });
            
            const euPricingPromises = Object.entries(MARKETPLACES).map(async ([country, marketplace]) => {
              if (country === 'UK') return { country, pricing: new Map() };
              
              try {
                const pricing = await pricingService.getCompetitivePricing(
                  asins,
                  marketplace.id
                );
                return { country, pricing };
              } catch (error) {
                console.error(`EU pricing error for ${country}:`, error);
                return { country, pricing: new Map() };
              }
            });

            const euPricingResults = await Promise.all(euPricingPromises);
            const allEuPricing = new Map();
            euPricingResults.forEach(({ country, pricing }) => {
              allEuPricing.set(country, pricing);
            });

            // Step 4: Process opportunities for this batch immediately
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Analyzing opportunities for batch ${Math.floor(i/batchSize) + 1}...`, 
                progress: 20 + ((i + 0.9) / uniqueProducts.length) * 60 
              } 
            });
            
            for (const { product, fees } of feesResults) {
              if (!fees) {
                processedCount++;
                continue;
              }

              const ukPrice = product.ukPrice;
              const ukCompetitors = product.ukCompetitors;
              const ukSalesRank = product.ukSalesRank;
              const salesPerMonth = 0; // Sales per month data not available

              const referralFee = fees.referralFee || 0;
              const amazonFees = fees.totalFees || 0;
              const digitalServicesFee = amazonFees * 0.02; // 2% of Amazon fees

              // Process EU prices (already fetched)
              const euPrices: any[] = [];
              let bestOpportunity: any = null;

              for (const [country] of Object.entries(MARKETPLACES)) {
                if (country === 'UK') continue;
                
                const countryPricing = allEuPricing.get(country)?.get(product.asin);
                if (!countryPricing || !countryPricing.price) continue;
                
                const sourcePrice = countryPricing.price;
                const sourcePriceGBP = countryPricing.currency === 'EUR' 
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
                      asin: product.asin,
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
                  asin: product.asin,
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
                  storefronts: product.storefronts // Include which storefronts have this ASIN
                };

                sendMessage({ 
                  type: 'opportunity', 
                  data: opportunity 
                });
              }

              processedCount++;
            }

            // Send progress update after completing this batch
            const progress = 20 + (processedCount / uniqueProducts.length) * 70;
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueProducts.length/batchSize)} - Analyzed ${processedCount}/${uniqueProducts.length} ASINs, found ${opportunitiesFound} opportunities`, 
                progress 
              } 
            });

          } catch (batchError) {
            console.error('Batch processing error:', batchError);
            // Skip failed ASINs in this batch
            processedCount += batch.length;
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