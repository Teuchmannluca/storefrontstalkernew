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

// Current EUR to GBP exchange rate (you should fetch this from an API)
const EUR_TO_GBP_RATE = 0.86; // Example rate

interface EUMarketplacePrice {
  marketplace: string;
  sourcePrice: number;
  sourcePriceGBP: number;
  profit: number;
  profitMargin: number;
  roi: number;
  totalCost: number;
}

interface ArbitrageOpportunity {
  asin: string;
  productName: string;
  productImage: string;
  targetPrice: number;
  amazonFees: number;
  referralFee: number;
  fbaFee: number;
  digitalServicesFee: number;
  ukCompetitors: number;
  ukLowestPrice: number;
  ukSalesRank: number;
  euPrices: EUMarketplacePrice[];
  bestOpportunity: EUMarketplacePrice;
}

export async function POST(request: NextRequest) {
  try {
    // Check required environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      aws: { accessKeyId: true, secretAccessKey: true },
      amazon: { accessKeyId: true, secretAccessKey: true, refreshToken: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Initialize Supabase client with service role for server-side access
    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );
    
    // Verify user is authenticated
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

    // Step 1: Fetch all ASINs from the storefront
    console.log('Fetching products for storefront:', storefrontId);
    
    // Verify the storefront exists
    const { data: storefront, error: storefrontError } = await supabase
      .from('storefronts')
      .select('*')
      .eq('id', storefrontId)
      .single();
      
    if (storefrontError || !storefront) {
      console.error('Storefront error:', storefrontError);
      return NextResponse.json({ 
        error: 'Storefront not found',
        details: storefrontError 
      }, { status: 404 });
    }
    
    console.log('Storefront found:', storefront);
    
    // Now fetch products - let's fetch all columns to ensure we get the data
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('storefront_id', storefrontId)
      .limit(100); // Limit to prevent overwhelming the API

    console.log('Products query result:', { 
      productsFound: products?.length || 0, 
      error: productsError 
    });

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ 
        error: 'Failed to fetch products',
        details: productsError 
      }, { status: 500 });
    }
    
    if (!products || products.length === 0) {
      // Let's also check the count directly
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('storefront_id', storefrontId);
        
      console.log('Product count check:', count);
      
      return NextResponse.json({ 
        error: 'No products found for this storefront',
        storefrontId: storefrontId,
        productCount: count || 0
      }, { status: 404 });
    }

    console.log(`Found ${products.length} products to analyze`);

    const opportunities: ArbitrageOpportunity[] = [];
    const errors: any[] = [];

    // Process ASINs in batches of 20
    for (let i = 0; i < products.length; i += 20) {
      const batch = products.slice(i, i + 20);
      const asins = batch.map(p => p.asin);
      
      console.log(`Processing batch ${Math.floor(i/20) + 1}/${Math.ceil(products.length/20)}`);

      try {
        // Step 2: Get competitive pricing for all marketplaces
        const pricingPromises = Object.entries(MARKETPLACES).map(async ([country, marketplace]) => {
          try {
            console.log(`Fetching pricing for ${country} marketplace (${marketplace.id})`);
            const pricing = await pricingClient.getCompetitivePricing(
              asins,
              marketplace.id,
              'Asin',
              'Consumer'
            );
            console.log(`Success: Got pricing data for ${country}:`, pricing.length, 'products');
            return { country, pricing };
          } catch (error: any) {
            console.error(`Error fetching pricing for ${country}:`, error.message);
            // Continue with empty pricing data for this marketplace
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
            
            // First try to get buy box price (competitivePriceId === '1')
            let priceData = product.competitivePricing?.CompetitivePrices?.find(
              (cp: any) => cp.CompetitivePriceId === '1'
            );
            
            // If no buy box, get any competitive price
            if (!priceData && product.competitivePricing?.CompetitivePrices?.length > 0) {
              priceData = product.competitivePricing.CompetitivePrices[0];
            }
            
            if (priceData && priceData.Price) {
              console.log(`Found pricing for ${asin} in ${country}:`, {
                competitivePriceId: priceData.CompetitivePriceId,
                price: priceData.Price.ListingPrice?.Amount || priceData.Price.LandedPrice?.Amount,
                currency: priceData.Price.ListingPrice?.CurrencyCode
              });
              
              pricingByAsin.get(asin)[country] = {
                price: priceData.Price.ListingPrice?.Amount || priceData.Price.LandedPrice?.Amount,
                currency: priceData.Price.ListingPrice?.CurrencyCode,
                numberOfOffers: product.competitivePricing?.NumberOfOfferListings?.find(
                  (l: any) => l.condition === 'New'
                )?.Count || 0,
                lowestPrice: product.competitivePricing?.CompetitivePrices
                  ?.map((cp: any) => cp.Price?.ListingPrice?.Amount || cp.Price?.LandedPrice?.Amount)
                  ?.filter((p: any) => p)
                  ?.sort((a: any, b: any) => a - b)[0],
                salesRankings: product.salesRankings
              };
            } else {
              console.log(`No pricing data found for ${asin} in ${country}`);
            }
          });
        });

        // Step 3 & 4: For each ASIN with EU prices, calculate fees and profit
        console.log(`Processing ${pricingByAsin.size} ASINs with pricing data`);
        
        const opportunitiesByAsin = new Map<string, ArbitrageOpportunity>();
        
        const pricingEntries = Array.from(pricingByAsin.entries());
        for (const [asin, marketplacePrices] of pricingEntries) {
          const product = products.find(p => p.asin === asin);
          console.log(`Processing ASIN ${asin}:`, {
            hasProduct: !!product,
            hasUKPrice: !!marketplacePrices.UK,
            marketplaces: Object.keys(marketplacePrices)
          });
          
          if (!product || !marketplacePrices.UK) {
            console.log(`Skipping ${asin}: missing product or UK price`);
            continue;
          }

          const ukPrice = marketplacePrices.UK.price;
          const ukCompetitors = marketplacePrices.UK.numberOfOffers;
          const ukLowestPrice = marketplacePrices.UK.lowestPrice || ukPrice;
          const ukSalesRank = marketplacePrices.UK.salesRankings?.[0]?.rank || 0;

          console.log(`${asin} - UK Price: £${ukPrice}`);

          // Calculate fees once for this ASIN
          let amazonFees = 0;
          let referralFee = 0;
          let fbaFee = 0;
          let digitalServicesFee = ukPrice * 0.02;

          try {
            console.log(`Calculating fees for ${asin}...`);
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
              
              referralFee = feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee.amount || 0;
              fbaFee = feeDetails.find(f => f.feeType.includes('FBA'))?.finalFee.amount || 0;
              amazonFees = fees.totalFeesEstimate?.amount || 0;
              
              console.log(`${asin} fees calculated:`, {
                amazonFees: amazonFees.toFixed(2),
                referralFee: referralFee.toFixed(2),
                digitalServicesFee: digitalServicesFee.toFixed(2)
              });
            } else {
              console.log(`❌ Failed to get fees for ${asin}:`, feesEstimate.status);
              continue; // Skip this ASIN if we can't get fees
            }
          } catch (feeError) {
            console.error(`Error calculating fees for ${asin}:`, feeError);
            continue; // Skip this ASIN if fees calculation fails
          }

          // Now check all EU marketplaces for this ASIN
          const euPrices: EUMarketplacePrice[] = [];
          let bestOpportunity: EUMarketplacePrice | null = null;

          for (const [country, data] of Object.entries(marketplacePrices)) {
            if (country === 'UK' || !data) continue;
            
            const priceData = data as any;
            // Convert EUR to GBP
            const sourcePrice = priceData.price;
            const sourcePriceGBP = priceData.currency === 'EUR' 
              ? sourcePrice * EUR_TO_GBP_RATE 
              : sourcePrice;

            console.log(`${asin} - ${country} Price: ${priceData.currency} ${sourcePrice} (£${sourcePriceGBP})`);

            // Calculate profit for this marketplace
            const totalCost = sourcePriceGBP + amazonFees + digitalServicesFee;
            const profit = ukPrice - totalCost;
            const profitMargin = (profit / ukPrice) * 100;
            const roi = (profit / sourcePriceGBP) * 100;

            const marketplacePrice: EUMarketplacePrice = {
              marketplace: country,
              sourcePrice,
              sourcePriceGBP,
              profit,
              profitMargin,
              roi,
              totalCost
            };

            euPrices.push(marketplacePrice);

            // Track best opportunity (highest ROI)
            if (profit > 0 && (!bestOpportunity || roi > bestOpportunity.roi)) {
              bestOpportunity = marketplacePrice;
            }

            console.log(`${asin} ${country} calculation:`, {
              sourcePriceGBP: sourcePriceGBP.toFixed(2),
              totalCost: totalCost.toFixed(2),
              profit: profit.toFixed(2),
              roi: roi.toFixed(2) + '%'
            });
          }

          // Only create opportunity if there's at least one profitable EU price
          if (bestOpportunity && bestOpportunity.profit > 0) {
            console.log(`✅ Adding ASIN ${asin} with ${euPrices.length} EU prices, best: ${bestOpportunity.marketplace} (${bestOpportunity.roi.toFixed(1)}% ROI)`);
            
            opportunitiesByAsin.set(asin, {
              asin,
              productName: product.product_name || asin,
              productImage: product.image_link || '',
              targetPrice: ukPrice,
              amazonFees,
              referralFee,
              fbaFee,
              digitalServicesFee,
              ukCompetitors,
              ukLowestPrice,
              ukSalesRank,
              euPrices: euPrices.sort((a, b) => b.roi - a.roi), // Sort by ROI descending
              bestOpportunity
            });
          } else {
            console.log(`❌ No profitable opportunities for ${asin}`);
          }
        }

        // Convert map to array
        const opportunities = Array.from(opportunitiesByAsin.values());
      } catch (batchError) {
        console.error('Batch processing error:', batchError);
        errors.push({ batch: i, error: 'Batch processing failed' });
      }

      // Add delay between batches to respect rate limits
      if (i + 20 < products.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    // Sort opportunities by best ROI
    opportunities.sort((a, b) => b.bestOpportunity.roi - a.bestOpportunity.roi);

    return NextResponse.json({
      success: true,
      opportunities: opportunities.slice(0, 50), // Return top 50
      totalOpportunities: opportunities.length,
      productsAnalyzed: products.length,
      errors: errors.length > 0 ? errors : undefined,
      exchangeRate: EUR_TO_GBP_RATE
    });

  } catch (error: any) {
    console.error('Arbitrage analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze arbitrage opportunities' },
      { status: 500 }
    );
  }
}