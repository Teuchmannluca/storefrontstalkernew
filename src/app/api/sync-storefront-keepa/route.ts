import { NextRequest, NextResponse } from 'next/server';
import { KeepaStorefrontAPI } from '@/lib/keepa-storefront';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers';
import { KeepaPersistentRateLimiter } from '@/lib/keepa-persistent-rate-limiter';
import { getServiceRoleClient } from '@/lib/supabase-server';
import { notificationService } from '@/lib/notification-service';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user } = await requireAuth();
    const supabase = getServiceRoleClient();
    
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

    // Initialize tokens from API response (we will also use our persistent limiter)
    keepaStorefront.initializeTokensFromAPI();

    // Use a persistent token limiter to avoid calling Keepa too early
    const rateLimiter = new KeepaPersistentRateLimiter(user.id);
    const availableNow = await rateLimiter.getAvailableTokens();
    if (availableNow < 50) {
      const waitMs = await rateLimiter.getWaitTimeForTokens(50);
      const tokensNeeded = 50 - availableNow;
      return NextResponse.json(
        {
          error: 'Insufficient Keepa API tokens available',
          availableTokens: availableNow,
          requiredTokens: 50,
          tokensNeeded,
          waitTimeSeconds: Math.ceil(waitMs / 1000),
          waitTimeMinutes: Math.ceil(waitMs / 60000),
          regenerationRate: '20 tokens per minute'
        },
        { status: 429 }
      );
    }
    // Reserve tokens so concurrent requests do not start too early
    await rateLimiter.consumeTokens(50);

    // Step 2: Fetch ASINs from seller storefront (this costs 50 tokens)
    console.log('Fetching ASINs from seller storefront...');
    let asinResult;
    try {
      asinResult = await keepaStorefront.getSellerASINs(sellerId, 0); // Get first page  
    } catch (error: any) {
      // Handle token errors from the actual API call
      if (error.message?.includes('Insufficient Keepa API tokens')) {
        const currentTokens = keepaStorefront.getAvailableTokens();
        const tokensNeeded = 50 - currentTokens;
        const waitTimeMinutes = Math.ceil(tokensNeeded / 20); // 20 tokens per minute
        
        return NextResponse.json(
          { 
            error: 'Insufficient Keepa API tokens available',
            availableTokens: currentTokens,
            requiredTokens: 50,
            tokensNeeded,
            waitTimeSeconds: waitTimeMinutes * 60,
            waitTimeMinutes,
            regenerationRate: '20 tokens per minute'
          },
          { status: 429 }
        );
      }
      throw error; // Re-throw other errors
    }
    
    // Sync our persistent tracker with real Keepa token info if available
    if (asinResult?.tokenInfo) {
      await supabase
        .from('keepa_token_tracker')
        .update({
          available_tokens: asinResult.tokenInfo.tokensLeft,
          last_refill_at: new Date(asinResult.tokenInfo.timestamp).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    }

    const asins = asinResult.asinList;
    console.log(`Found ${asins.length} ASINs for seller ${sellerId}`);
    
    // Get seller info from the same API response (no extra cost)
    const sellerInfo = {
      sellerId: sellerId,
      name: asinResult.sellerName || `Seller ${sellerId}`
    };

    // Update storefront with seller name if available
    if (asinResult.sellerName) {
      await supabase
        .from('storefronts')
        .update({ name: asinResult.sellerName })
        .eq('id', storefrontId);
    }

    if (asins.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products found for this seller storefront',
        seller: sellerInfo,
        productsAdded: 0,
        tokensUsed: asinResult.tokenInfo?.tokensConsumed || 50
      });
    }

    // Step 3: Get existing products to avoid duplicates
    const { data: existingProducts } = await supabase
      .from('products')
      .select('asin')
      .eq('storefront_id', storefrontId);

    const existingAsins = new Set(existingProducts?.map(p => p.asin) || []);
    const newAsins = asins.filter(asin => !existingAsins.has(asin));

    console.log(`Found ${newAsins.length} new ASINs out of ${asins.length} total ASINs`);

    // Step 4: Save all new ASINs to database first (basic info only)
    let totalProductsAdded = 0;
    if (newAsins.length > 0) {
      console.log(`Saving ${newAsins.length} new ASINs to database...`);
      
      const basicProducts = newAsins.map(asin => ({
        storefront_id: storefrontId,
        seller_id: sellerId,
        asin: asin,
        product_name: asin, // Will be updated with SP-API data
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { data: insertedProducts, error: insertError } = await supabase
        .from('products')
        .insert(basicProducts)
        .select();

      if (insertError) {
        console.error('Error inserting basic products:', insertError);
        throw new Error('Failed to save ASINs to database');
      } else {
        totalProductsAdded = insertedProducts?.length || 0;
        console.log(`✅ Saved ${totalProductsAdded} ASINs to database`);
      }
    }

    // Step 5: Now enrich the new products with Amazon SP-API data
    let totalProductsWithDetails = 0;
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
              ['summaries', 'images']
            );

            const marketplaceData = {
              summary: catalogItem.summaries?.find(s => s.marketplaceId === spApiConfig.marketplaceId),
              images: catalogItem.images?.find(i => i.marketplaceId === spApiConfig.marketplaceId)?.images || []
            };

            const mainImage = marketplaceData.images.find(img => img.variant === 'MAIN')?.link || 
                             marketplaceData.images[0]?.link || 
                             null;

            totalProductsWithDetails++;
            consecutiveErrors = 0; // Reset error counter on success
            
            // Update existing product record instead of creating new one
            const updateData = {
              product_name: marketplaceData.summary?.itemName || asin,
              brand: marketplaceData.summary?.brandName,
              image_link: mainImage,
              category: marketplaceData.summary?.browseNode || null,
              updated_at: new Date().toISOString()
            };

            // Update the product in database
            const { error: updateError } = await supabase
              .from('products')
              .update(updateData)
              .eq('asin', asin)
              .eq('storefront_id', storefrontId);

            if (updateError) {
              console.error(`Error updating product ${asin}:`, updateError);
            }

            const elapsed = Date.now() - startTime;
            console.log(`✓ Updated ${asin} with SP-API data in ${elapsed}ms`);
            
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
          
            // Keep the basic ASIN record (already saved), SP-API enrichment failed
          }
          
          // Delay between requests to respect rate limits
          // Amazon allows 2 req/sec, so 500ms delay = 2 req/sec
          // Extra delay for first few requests to avoid initial quota issues
          const delay = globalIndex <= 5 ? 1500 : 500; // 1.5 seconds for first 5 requests, then 500ms
          if (i < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        // Products are updated individually, no batch insert needed
        console.log(`✓ Batch ${Math.floor(batchStart / batchSize) + 1} completed`);
        
        
        // Delay between batches
        if (batchStart + batchSize < newAsins.length) {
          console.log(`Batch complete. Waiting ${delayBetweenBatches / 1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      console.log(`\n✅ All batches completed successfully!`);
    }

    // Send notifications if products were added
    if (totalProductsAdded > 0) {
      // Get storefront name for notification
      const { data: storefrontData } = await supabase
        .from('storefronts')
        .select('name')
        .eq('id', storefrontId)
        .single();

      const storefrontName = storefrontData?.name || sellerInfo.name || `Seller ${sellerId}`;

      // Send sync complete notification
      await notificationService.sendNotification({
        userId: user.id,
        type: 'products_sync_complete',
        data: {
          storefrontName,
          productsAdded: totalProductsAdded,
          productsRemoved: 0,
          totalProducts: asins.length
        }
      });

      // Send new products found notification if significant
      if (totalProductsAdded >= 5) {
        await notificationService.sendNotification({
          userId: user.id,
          type: 'new_products_found',
          data: {
            storefrontName,
            count: totalProductsAdded
          }
        });
      }
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
      tokensUsed: asinResult.tokenInfo?.tokensConsumed || 50,
      tokensRemaining: keepaStorefront.getAvailableTokens(),
      message: `Successfully fetched ${asins.length} ASINs from storefront. Added ${totalProductsAdded} new products (${totalProductsWithDetails} with SP-API details).`
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