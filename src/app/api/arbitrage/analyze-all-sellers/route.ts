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

        // Process unique products one by one for live updates
        let processedCount = 0;
        let opportunitiesFound = 0;
        const totalProducts = uniqueProducts.length;

        // Process each product individually for better streaming updates
        for (const product of uniqueProducts) {
          const asin = product.asin;
          
          // Update progress for each product
          processedCount++;
          sendMessage({ 
            type: 'progress', 
            data: { 
              step: `Analyzing ${processedCount}/${totalProducts} ASINs...`, 
              progress: 20 + (processedCount / totalProducts) * 70 
            } 
          });

          try {
            // First get UK pricing
            const ukPricing = await pricingService.getCompetitivePricing(
              [asin],
              MARKETPLACES.UK.id
            );
            
            const ukPriceData = ukPricing.get(asin);
            if (!ukPriceData || !ukPriceData.price) {
              continue;
            }

            const ukPrice = ukPriceData.price;
            const ukCompetitors = ukPriceData.numberOfOffers || 0;
            const ukSalesRank = ukPriceData.salesRankings?.[0]?.rank || 0;
            const salesPerMonth = 0; // Sales per month data not available

            // Calculate fees
            const feesEstimate = await pricingService.getFeesEstimate(
              asin,
              ukPrice,
              MARKETPLACES.UK.id
            );

            const referralFee = feesEstimate.referralFee || 0;
            const amazonFees = feesEstimate.totalFees || 0;
            const digitalServicesFee = amazonFees * 0.02; // 2% of Amazon fees

            // Now fetch EU prices
            const euPrices: any[] = [];
            let bestOpportunity: any = null;

            for (const [country, marketplace] of Object.entries(MARKETPLACES)) {
              if (country === 'UK') continue;
              
              // Fetch pricing for this marketplace
              const marketplacePricing = await pricingService.getCompetitivePricing(
                [asin],
                marketplace.id
              );
              
              const countryPricing = marketplacePricing.get(asin);
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
                storefronts: product.storefronts // Include which storefronts have this ASIN
              };

              sendMessage({ 
                type: 'opportunity', 
                data: opportunity 
              });
            }

          } catch (error: any) {
            console.error(`Error processing ${asin}:`, error.message);
            // Continue with next ASIN
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