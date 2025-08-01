import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Optional: Add a secret token for security
    const authToken = request.headers.get('x-sync-token');
    if (authToken !== process.env.SYNC_SECRET_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get products that need details (where product_name equals asin)
    // First get all products, then filter
    const { data: allProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, asin, storefront_id, seller_id, product_name')
      .limit(200); // Get more to account for filtering
    
    const products = allProducts?.filter(p => p.product_name === p.asin).slice(0, 100) || [];

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products need updating',
        processed: 0
      });
    }

    console.log(`Starting background sync for ${products.length} products`);

    // Initialize SP-API client
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu',
    };

    const catalogClient = new SPAPICatalogClient(credentials, config);

    let processed = 0;
    let updated = 0;
    let errors = 0;
    const startTime = Date.now();

    // Process products one by one with rate limiting
    for (const product of products) {
      try {
        console.log(`Processing ${product.asin} (${processed + 1}/${products.length})`);
        
        const catalogItem = await catalogClient.getCatalogItem(
          product.asin,
          [config.marketplaceId],
          ['summaries', 'images', 'salesRanks']
        );

        const marketplaceData = {
          summary: catalogItem.summaries?.find(s => s.marketplaceId === config.marketplaceId),
          images: catalogItem.images?.find(i => i.marketplaceId === config.marketplaceId)?.images || [],
          salesRanks: catalogItem.salesRanks?.find(s => s.marketplaceId === config.marketplaceId)?.ranks || []
        };

        const mainImage = marketplaceData.images.find(img => img.variant === 'MAIN')?.link || 
                         marketplaceData.images[0]?.link || 
                         null;

        // Update product in database
        const { error: updateError } = await supabase
          .from('products')
          .update({
            product_name: marketplaceData.summary?.itemName || product.asin,
            brand: marketplaceData.summary?.brandName,
            image_link: mainImage,
            current_sales_rank: marketplaceData.salesRanks[0]?.rank,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id);

        if (updateError) {
          console.error(`Error updating product ${product.asin}:`, updateError);
          errors++;
        } else {
          updated++;
        }

        processed++;

        // Check if we're approaching time limits (e.g., 5 minutes for serverless functions)
        const elapsed = Date.now() - startTime;
        if (elapsed > 4 * 60 * 1000) { // 4 minutes
          console.log('Approaching time limit, stopping batch');
          break;
        }

      } catch (error: any) {
        console.error(`Error processing ${product.asin}:`, error.message);
        errors++;
        processed++;

        // If we hit a rate limit, stop the batch
        if (error.message?.includes('429')) {
          console.log('Rate limit hit, stopping batch');
          break;
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      processed,
      updated,
      errors,
      remaining: products.length - processed,
      totalTime: `${totalTime}s`,
      rateLimit: `${(processed / parseFloat(totalTime)).toFixed(2)} products/second`
    });

  } catch (error) {
    console.error('Background sync error:', error);
    return NextResponse.json(
      { error: 'Background sync failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    // Count products that need syncing
    // We need to get all products and filter manually
    const { data: allProds } = await supabase
      .from('products')
      .select('asin, product_name');
    
    const pendingCount = allProds?.filter(p => p.product_name === p.asin).length || 0;

    // Count total products
    const { count: totalCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      pendingSync: pendingCount || 0,
      totalProducts: totalCount || 0,
      syncProgress: totalCount ? ((totalCount - (pendingCount || 0)) / totalCount * 100).toFixed(2) + '%' : '0%'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}