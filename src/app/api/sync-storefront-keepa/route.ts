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

    let productsAdded = 0;
    let productsWithDetails = 0;

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
      
      // Process ASINs one by one to respect rate limits
      // SP-API Catalog Items allows 2 requests per second with burst of 6
      const productsToInsert = [];
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;
      
      for (let i = 0; i < newAsins.length; i++) {
        const asin = newAsins[i];
        console.log(`Processing ASIN ${i + 1}/${newAsins.length}: ${asin}`);
        
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

          productsWithDetails++;
          consecutiveErrors = 0; // Reset error counter on success
          
          productsToInsert.push({
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
          
          // If we hit rate limits or have too many errors, slow down
          if (error.message?.includes('429') || consecutiveErrors >= maxConsecutiveErrors) {
            console.log('Rate limit detected or too many errors, waiting 60 seconds...');
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            consecutiveErrors = 0;
          }
          
          // Still insert the product with just the ASIN
          productsToInsert.push({
            storefront_id: storefrontId,
            seller_id: sellerId,
            asin: asin,
            product_name: asin,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
        
        // Progress update every 10 products
        if ((i + 1) % 10 === 0) {
          console.log(`Progress: ${i + 1}/${newAsins.length} ASINs processed`);
        }
      }

      // Insert all products with their details
      const { data: insertedProducts, error: insertError } = await supabase
        .from('products')
        .insert(productsToInsert)
        .select();

      if (insertError) {
        console.error('Error inserting products:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert products', details: insertError },
          { status: 500 }
        );
      } else {
        productsAdded = insertedProducts?.length || 0;
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
      productsAdded,
      productsWithDetails,
      message: `Successfully fetched ${asins.length} ASINs. Added ${productsAdded} new products (${productsWithDetails} with full details).`
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