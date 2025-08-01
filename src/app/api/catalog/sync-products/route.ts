import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';

export async function POST(request: NextRequest) {
  try {
    // Check required environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing required environment variables' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { storefrontId, limit = 20 } = await request.json();

    if (!storefrontId) {
      return NextResponse.json(
        { error: 'Storefront ID is required' },
        { status: 400 }
      );
    }

    // Fetch products that need updating
    // First get all products, then filter for those where name equals ASIN
    const { data: allProducts, error: fetchError } = await supabase
      .from('products')
      .select('id, asin, product_name')
      .eq('storefront_id', storefrontId)
      .limit(limit * 2); // Get more to account for filtering
    
    const products = allProducts?.filter(p => p.product_name === p.asin).slice(0, limit) || [];

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products need updating',
        updated: 0
      });
    }

    // Check SP-API environment variables
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const amazonAccessKeyId = process.env.AMAZON_ACCESS_KEY_ID;
    const amazonSecretAccessKey = process.env.AMAZON_SECRET_ACCESS_KEY;
    const amazonRefreshToken = process.env.AMAZON_REFRESH_TOKEN;
    
    if (!awsAccessKeyId || !awsSecretAccessKey || !amazonAccessKeyId || !amazonSecretAccessKey || !amazonRefreshToken) {
      return NextResponse.json(
        { error: 'Missing required AWS/Amazon credentials' },
        { status: 500 }
      );
    }

    // Initialize SP-API client
    const credentials = {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: amazonAccessKeyId,
      clientSecret: amazonSecretAccessKey,
      refreshToken: amazonRefreshToken,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    const catalogClient = new SPAPICatalogClient(credentials, config);

    // Process products in batches
    const batchSize = 5;
    const results = [];
    let updatedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (product) => {
        try {
          // Fetch catalog data
          const catalogItem = await catalogClient.getCatalogItem(
            product.asin,
            [config.marketplaceId],
            ['summaries', 'images', 'salesRanks', 'dimensions']
          );

          const marketplaceData = {
            summary: catalogItem.summaries?.find(s => s.marketplaceId === config.marketplaceId),
            images: catalogItem.images?.find(i => i.marketplaceId === config.marketplaceId)?.images || [],
            salesRanks: catalogItem.salesRanks?.find(s => s.marketplaceId === config.marketplaceId)?.ranks || []
          };

          // Update product in database
          const updateData = {
            product_name: marketplaceData.summary?.itemName || product.asin,
            brand: marketplaceData.summary?.brandName,
            manufacturer: marketplaceData.summary?.manufacturer,
            image_link: marketplaceData.images.find(img => img.variant === 'MAIN')?.link,
            current_sales_rank: marketplaceData.salesRanks[0]?.rank,
            sales_rank_category: marketplaceData.salesRanks[0]?.title,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', product.id);

          if (updateError) {
            throw updateError;
          }

          updatedCount++;
          return {
            asin: product.asin,
            success: true,
            data: updateData
          };
        } catch (error: any) {
          console.error(`Error processing ASIN ${product.asin}:`, error);
          errorCount++;
          return {
            asin: product.asin,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      totalProducts: products.length,
      updated: updatedCount,
      errors: errorCount,
      results
    });

  } catch (error) {
    console.error('Sync products error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to sync products' },
      { status: 500 }
    );
  }
}