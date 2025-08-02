import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
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

  const { asins } = await request.json();
  
  if (!asins || !Array.isArray(asins) || asins.length === 0) {
    return NextResponse.json({ error: 'ASINs array is required' }, { status: 400 });
  }

  // Validate ASINs
  const validASINs = asins.filter(asin => /^[A-Z0-9]{10}$/.test(asin.toUpperCase()));
  if (validASINs.length === 0) {
    return NextResponse.json({ error: 'No valid ASINs provided' }, { status: 400 });
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
            total_products: validASINs.length,
            unique_asins: validASINs.length,
            opportunities_found: 0,
            metadata: {
              asins: validASINs,
              exchange_rate: EUR_TO_GBP_RATE
            }
          })
          .select()
          .single();

        if (scanError || !scan) {
          console.error('Failed to create scan record:', scanError);
          sendMessage({ type: 'error', data: { error: 'Failed to initialise scan. Please ensure database tables are set up correctly.' } });
          controller.close();
          return;
        }

        scanId = scan.id;
        sendMessage({ type: 'progress', data: { step: 'Scan initialised', progress: 5 } });

        // Initialize SP-API clients
        const awsCredentials = {
          accessKeyId: envCheck.values.awsAccessKeyId,
          secretAccessKey: envCheck.values.awsSecretAccessKey,
          region: envCheck.values.awsRegion || 'eu-west-1'
        };
        
        const spApiConfig = {
          clientId: envCheck.values.amazonAccessKeyId,
          clientSecret: envCheck.values.amazonSecretAccessKey,
          refreshToken: envCheck.values.amazonRefreshToken,
          marketplaceId: envCheck.values.amazonMarketplaceId,
          region: 'eu' as 'eu'
        };
        
        const catalogClient = new SPAPICatalogClient(awsCredentials, spApiConfig);
        const competitivePricingClient = new SPAPICompetitivePricingClient(awsCredentials, spApiConfig);
        const productFeesClient = new SPAPIProductFeesClient(awsCredentials, spApiConfig);

        let opportunitiesFound = 0;
        const totalProducts = validASINs.length;
        
        sendMessage({ 
          type: 'progress', 
          data: { 
            step: `Analysing ${totalProducts} ASINs...`, 
            progress: 10,
            current: 0,
            total: totalProducts
          } 
        });

        // Process ASINs
        for (let i = 0; i < validASINs.length; i++) {
          const asin = validASINs[i];
          const progress = 10 + (i / totalProducts) * 80;
          
          try {
            sendMessage({ 
              type: 'progress', 
              data: { 
                step: `Analysing ASIN ${i + 1} of ${totalProducts}: ${asin}`,
                progress,
                current: i + 1,
                total: totalProducts
              }
            });

            // Get product details from catalog API
            let productName = asin;
            let productImage = '';
            let salesRank = 0;
            
            try {
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
            } catch (error) {
              console.error('Catalog API error for', asin, error);
            }

            // Get UK pricing
            const ukPricingData = await competitivePricingClient.getCompetitivePricing([asin], MARKETPLACES.UK.id);
            
            if (!ukPricingData || ukPricingData.length === 0) {
              console.log(`No UK pricing found for ${asin}`);
              continue;
            }

            const ukProduct = ukPricingData[0];
            let ukPrice = 0;
            
            // Extract price from competitive pricing data
            if (ukProduct.competitivePricing?.competitivePrices) {
              const priceData = ukProduct.competitivePricing.competitivePrices.find(
                (cp: any) => cp.competitivePriceId === '1'
              ) || ukProduct.competitivePricing.competitivePrices[0];
              
              if (priceData?.price) {
                ukPrice = priceData.price.amount || 0;
              }
            }
            
            if (!ukPrice || ukPrice <= 0) {
              console.log(`No valid UK price for ${asin}`);
              continue;
            }
            
            console.log(`UK price for ${asin}: £${ukPrice}`);
            console.log(`UK competitive pricing data:`, ukProduct.competitivePricing);

            // Get UK fees
            const ukFeesResponse = await productFeesClient.getMyFeesEstimateForASIN(
              asin,
              {
                listingPrice: {
                  currencyCode: MARKETPLACES.UK.currency,
                  amount: ukPrice
                }
              },
              MARKETPLACES.UK.id,
              undefined,
              true // IsAmazonFulfilled = true for FBA
            );
            
            console.log(`UK fees response for ${asin}:`, JSON.stringify(ukFeesResponse, null, 2));
            
            // Extract fee details from the response
            let referralFee = 0;
            let fbaFee = 0;
            let variableClosingFee = 0;
            let otherFees = 0;
            
            if (ukFeesResponse.feesEstimate?.feeDetailList) {
              for (const fee of ukFeesResponse.feesEstimate.feeDetailList) {
                const feeAmount = fee.finalFee?.amount || 0;
                
                switch (fee.feeType) {
                  case 'ReferralFee':
                    referralFee = feeAmount;
                    break;
                  case 'FBAFees':
                  case 'FulfillmentFees':
                  case 'FBAPerUnitFulfillmentFee':
                  case 'FBAPerOrderFulfillmentFee':
                    fbaFee += feeAmount;
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
            }
            
            const totalUKFees = referralFee + fbaFee + variableClosingFee + otherFees;
            const digitalServicesFee = totalUKFees * 0.02; // 2% digital services fee on Amazon fees
            const totalFeesIncludingDST = totalUKFees + digitalServicesFee;
            const vatOnFees = totalFeesIncludingDST * 0.20; // VAT on all fees (20%) - this is a business expense
            
            console.log(`UK fees breakdown - Referral: £${referralFee}, FBA: £${fbaFee}, VCF: £${variableClosingFee}, Total: £${totalUKFees}`);

            // Get EU marketplace prices
            const euPrices = [];
            const euMarketplaces = ['DE', 'FR', 'IT', 'ES'];

            for (const marketplace of euMarketplaces) {
              try {
                await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
                
                const euPricingData = await competitivePricingClient.getCompetitivePricing([asin], MARKETPLACES[marketplace as keyof typeof MARKETPLACES].id);
                
                if (euPricingData && euPricingData.length > 0) {
                  const euProduct = euPricingData[0];
                  let euPrice = 0;
                  
                  // Extract price from competitive pricing data
                  if (euProduct.competitivePricing?.competitivePrices) {
                    const priceData = euProduct.competitivePricing.competitivePrices.find(
                      (cp: any) => cp.competitivePriceId === '1'
                    ) || euProduct.competitivePricing.competitivePrices[0];
                    
                    if (priceData?.price) {
                      euPrice = priceData.price.amount || 0;
                    }
                  }
                  
                  if (euPrice && euPrice > 0) {
                    const sourcePriceGBP = euPrice * EUR_TO_GBP_RATE;
                    // Total cost includes VAT on fees as it's a real business expense
                    const totalCost = sourcePriceGBP + totalFeesIncludingDST + vatOnFees;
                    const profit = ukPrice - totalCost;
                    const profitMargin = (profit / ukPrice) * 100;
                    const roi = (profit / sourcePriceGBP) * 100; // ROI should be based on source price, not total cost

                    console.log(`${marketplace} price for ${asin}: €${euPrice} = £${sourcePriceGBP}`);
                    console.log(`Total cost: £${totalCost} (includes £${totalUKFees} fees + £${digitalServicesFee} digital + £${vatOnFees} VAT on fees)`);
                    console.log(`Profit: £${profit} (${roi.toFixed(1)}% ROI)`);

                    euPrices.push({
                      marketplace,
                      sourcePrice: euPrice,
                      sourcePriceGBP,
                      profit,
                      profitMargin,
                      roi,
                      totalCost
                    });
                  }
                }
              } catch (error) {
                console.error(`Error getting ${marketplace} pricing for ${asin}:`, error);
              }
            }

            if (euPrices.length === 0) {
              console.log(`No EU prices found for ${asin}`);
              continue;
            }

            // Find best opportunity
            const bestOpportunity = euPrices.reduce((best, current) => 
              current.profit > best.profit ? current : best
            );

            if (bestOpportunity.profit > 0) {
              opportunitiesFound++;
              
              // Send opportunity data
              sendMessage({
                type: 'opportunity',
                data: {
                  asin,
                  productName,
                  productImage,
                  targetPrice: ukPrice,
                  amazonFees: totalUKFees,
                  referralFee,
                  fbaFee,
                  digitalServicesFee,
                  ukCompetitors: ukProduct.competitivePricing?.numberOfOfferListings?.find(
                    (l: any) => l.condition === 'New'
                  )?.count || 0,
                  ukLowestPrice: ukPrice,
                  ukSalesRank: salesRank,
                  euPrices,
                  bestOpportunity
                }
              });

              // Save opportunity to database
              await supabase
                .from('arbitrage_opportunities')
                .insert({
                  scan_id: scanId,
                  asin,
                  product_name: productName,
                  product_image: productImage,
                  target_price: ukPrice.toString(),
                  target_marketplace: 'UK',
                  amazon_fees: totalUKFees.toString(),
                  referral_fee: referralFee.toString(),
                  digital_services_fee: digitalServicesFee.toString(),
                  uk_competitors: ukProduct.competitivePricing?.numberOfOfferListings?.find(
                    (l: any) => l.condition === 'New'
                  )?.count || 0,
                  uk_sales_rank: salesRank,
                  best_source_marketplace: bestOpportunity.marketplace,
                  best_source_price: bestOpportunity.sourcePrice.toString(),
                  best_source_price_gbp: bestOpportunity.sourcePriceGBP.toString(),
                  best_profit: bestOpportunity.profit.toString(),
                  best_roi: bestOpportunity.roi.toString(),
                  all_marketplace_prices: { euPrices }
                });
            }

          } catch (error) {
            console.error(`Error processing ASIN ${asin}:`, error);
          }
        }

        // Update scan record
        await supabase
          .from('arbitrage_scans')
          .update({
            status: 'completed',
            opportunities_found: opportunitiesFound,
            completed_at: new Date().toISOString()
          })
          .eq('id', scanId);

        sendMessage({
          type: 'complete',
          data: {
            message: `Analysis complete! Found ${opportunitiesFound} profitable opportunities out of ${totalProducts} ASINs.`,
            opportunitiesFound,
            totalProducts
          }
        });

      } catch (error: any) {
        console.error('Analysis error:', error);
        
        // Update scan status to failed
        if (scanId) {
          await supabase
            .from('arbitrage_scans')
            .update({
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString()
            })
            .eq('id', scanId);
        }
        
        sendMessage({ 
          type: 'error', 
          data: { 
            error: error.message || 'An error occurred during analysis'
          } 
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