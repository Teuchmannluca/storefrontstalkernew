import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KeepaStorefrontAPI } from '@/lib/keepa-storefront';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { storefrontId, sellerId } = await request.json();
    
    if (!storefrontId || !sellerId) {
      return NextResponse.json(
        { error: 'Storefront ID and Seller ID are required' },
        { status: 400 }
      );
    }

    // Initialize Keepa API
    const keepaApiKey = process.env.KEEPA_API_KEY;
    if (!keepaApiKey) {
      return NextResponse.json(
        { error: 'Keepa API key not configured' },
        { status: 500 }
      );
    }

    const keepaDomain = parseInt(process.env.KEEPA_DOMAIN || '2');
    console.log('Using Keepa domain:', keepaDomain, '(2 = UK)');
    console.log('Seller ID:', sellerId);
    const keepaStorefront = new KeepaStorefrontAPI(keepaApiKey, keepaDomain);

    // Step 1: Check available tokens
    // Rate limiting temporarily disabled for testing
    // const availableTokens = keepaStorefront.getAvailableTokens();
    // if (availableTokens < 50) {
    //   return NextResponse.json(
    //     { 
    //       error: 'Insufficient Keepa API tokens available',
    //       availableTokens,
    //       requiredTokens: 50,
    //       waitTimeSeconds: Math.ceil((50 - availableTokens) * 3)
    //     },
    //     { status: 429 }
    //   );
    // }

    // Step 2: Fetch seller info
    const sellerInfo = await keepaStorefront.getSellerInfo(sellerId);
    if (!sellerInfo) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    // Update storefront with seller name if available
    if (sellerInfo.name) {
      await supabase
        .from('storefronts')
        .update({ name: sellerInfo.name })
        .eq('id', storefrontId);
    }

    // Step 3: Fetch all ASINs from seller (costs 50 tokens per page)
    const asins = await keepaStorefront.getAllSellerASINs(sellerId, 3); // Limit to 3 pages

    if (asins.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products found for this seller',
        seller: sellerInfo,
        productsAdded: 0
      });
    }

    // Step 4: Get existing products to avoid duplicates
    const { data: existingProducts } = await supabase
      .from('products')
      .select('asin')
      .eq('storefront_id', storefrontId);

    const existingAsins = new Set(existingProducts?.map(p => p.asin) || []);
    const newAsins = asins.filter(asin => !existingAsins.has(asin));

    // Initialize counters
    let totalProductsAdded = 0;
    let totalProductsWithDetails = 0;

    // Step 5: Fetch product details from SP-API if we have new ASINs
    if (newAsins.length > 0) {
      console.log(`Fetching product details for ${newAsins.length} ASINs`);
      
      // Initialize SP-API client
      const credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: undefined,
        region: process.env.AWS_REGION || 'eu-west-1',
      };
      
      const spApiConfig = {
        clientId: process.env.AMAZON_ACCESS_KEY_ID!,
        clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
        refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
        marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
        region: 'eu',
      };

      const catalogClient = new SPAPICatalogClient(credentials, spApiConfig);
      
      // Add initial delay to warm up the API connection
      console.log('Warming up SP-API connection...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second initial delay
      
      // Process ASINs in smaller batches to avoid hitting rate limits
      // SP-API Catalog Items allows 2 requests per second with burst of 2
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;
      const batchSize = 20; // Process 20 ASINs at a time
      const delayBetweenBatches = 5000; // 5 seconds between batches
      let rateLimitWaitTime = 60000; // Initial wait time for rate limits (1 minute)
      
      // Process in batches
      for (let batchStart = 0; batchStart < newAsins.length; batchStart += batchSize) {
        const batch = newAsins.slice(batchStart, Math.min(batchStart + batchSize, newAsins.length));
        console.log(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(newAsins.length / batchSize)} (${batch.length} ASINs)`);
        
        const batchProductsToInsert = [];
        
        for (let i = 0; i < batch.length; i++) {
          const asin = batch[i];
          const globalIndex = batchStart + i + 1;
          console.log(`Processing ASIN ${globalIndex}/${newAsins.length}: ${asin}`);
          
          try {
            // The rate limiter in catalogClient will handle the timing
            const startTime = Date.now();
          
          const catalogItem = await catalogClient.getCatalogItem(
            asin,
            [spApiConfig.marketplaceId],
            ['summaries', 'images', 'salesRanks']
          );

          const marketplaceData = {
            summary: catalogItem.summaries?.find(s => s.marketplaceId === spApiConfig.marketplaceId),
            images: catalogItem.images?.find(i => i.marketplaceId === spApiConfig.marketplaceId)?.images || [],
            salesRanks: catalogItem.salesRanks?.find(s => s.marketplaceId === spApiConfig.marketplaceId)?.ranks || []
          };

          const mainImage = marketplaceData.images.find(img => img.variant === 'MAIN')?.link || 
                           marketplaceData.images[0]?.link || 
                           null;

          totalProductsWithDetails++;
          consecutiveErrors = 0; // Reset error counter on success
          
          batchProductsToInsert.push({
            storefront_id: storefrontId,
            seller_id: sellerId,
            asin: asin,
            product_name: marketplaceData.summary?.itemName || asin,
            brand: marketplaceData.summary?.brandName,
            image_link: mainImage,
            current_sales_rank: marketplaceData.salesRanks[0]?.rank,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

            const elapsed = Date.now() - startTime;
            console.log(`✓ Fetched ${asin} in ${elapsed}ms`);
            
          } catch (error: any) {
            console.error(`Error fetching details for ASIN ${asin}:`, error.message);
            consecutiveErrors++;
            
            // Check for specific rate limit error or quota exceeded
            const isRateLimitError = error.response?.status === 429 || 
                                   error.message?.includes('429') || 
                                   error.message?.includes('Too Many Requests') ||
                                   error.message?.includes('QuotaExceeded') ||
                                   error.message?.includes('You exceeded your quota');
            
            if (isRateLimitError) {
              console.log(`Rate limit/quota exceeded! Waiting ${rateLimitWaitTime / 1000} seconds before retrying...`);
              await new Promise(resolve => setTimeout(resolve, rateLimitWaitTime));
              
              // Exponential backoff: double the wait time for next rate limit
              rateLimitWaitTime = Math.min(rateLimitWaitTime * 2, 300000); // Max 5 minutes
              consecutiveErrors = 0;
              
              // Retry the same ASIN
              i--; // Decrement to retry this ASIN
              continue;
            } else if (consecutiveErrors >= maxConsecutiveErrors) {
              console.log(`Too many consecutive errors (${consecutiveErrors}), waiting 60 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
              consecutiveErrors = 0;
            }
            
            // Reset rate limit wait time on non-rate-limit errors
            if (!isRateLimitError && consecutiveErrors === 0) {
              rateLimitWaitTime = 60000; // Reset to 1 minute
            }
          
            // Still insert the product with just the ASIN
            batchProductsToInsert.push({
              storefront_id: storefrontId,
              seller_id: sellerId,
              asin: asin,
              product_name: asin,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
          
          // Delay between requests to respect rate limits
          // Amazon allows 2 req/sec, so 500ms delay = 2 req/sec
          // Extra delay for first few requests to avoid initial quota issues
          const delay = globalIndex <= 5 ? 1500 : 500; // 1.5 seconds for first 5 requests, then 500ms
          if (i < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        // Save this batch to Supabase
        if (batchProductsToInsert.length > 0) {
          console.log(`Saving ${batchProductsToInsert.length} products from this batch to database...`);
          
          const { data: insertedProducts, error: insertError } = await supabase
            .from('products')
            .insert(batchProductsToInsert)
            .select();

          if (insertError) {
            console.error('Error inserting batch products:', insertError);
          } else {
            const batchAdded = insertedProducts?.length || 0;
            totalProductsAdded += batchAdded;
            console.log(`✓ Batch saved: ${batchAdded} products added to database`);
          }
        }
        
        // Delay between batches
        if (batchStart + batchSize < newAsins.length) {
          console.log(`Batch complete. Waiting ${delayBetweenBatches / 1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      console.log(`\n✅ All batches completed successfully!`);
    }

    return NextResponse.json({
      success: true,
      seller: {
        id: sellerInfo.sellerId,
        name: sellerInfo.name
      },
      totalAsins: asins.length,
      existingAsins: existingAsins.size,
      productsAdded: totalProductsAdded,
      productsWithDetails: totalProductsWithDetails,
      message: `Successfully fetched ${asins.length} ASINs. Added ${totalProductsAdded} new products (${totalProductsWithDetails} with full details).`
    });

  } catch (error) {
    console.error('Error syncing storefront:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to sync storefront' },
      { status: 500 }
    );
  }
}