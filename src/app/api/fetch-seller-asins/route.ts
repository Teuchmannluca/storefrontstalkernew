import { NextRequest, NextResponse } from 'next/server';
import { KeepaStorefrontAPI } from '@/lib/keepa-storefront';
import { getServiceRoleClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceRoleClient();
    const { sellerId, storefrontId } = await request.json();

    if (!sellerId) {
      return NextResponse.json(
        { error: 'Seller ID is required' },
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
    const keepaApi = new KeepaStorefrontAPI(keepaApiKey, keepaDomain);

    // Check available tokens before proceeding
    // Rate limiting temporarily disabled for testing
    // const availableTokens = keepaApi.getAvailableTokens();
    // if (availableTokens < 50) {
    //   return NextResponse.json(
    //     { 
    //       error: 'Insufficient Keepa API tokens available',
    //       availableTokens,
    //       requiredTokens: 50,
    //       waitTimeSeconds: Math.ceil((50 - availableTokens) * 3) // 20 tokens per minute = 3 seconds per token
    //     },
    //     { status: 429 }
    //   );
    // }

    // Fetch seller info first (1 token)
    const sellerInfo = await keepaApi.getSellerInfo(sellerId);
    
    if (!sellerInfo) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    // Fetch ASINs from the seller's storefront
    const asins = await keepaApi.getAllSellerASINs(sellerId, 5); // Limit to 5 pages for now

    // If storefrontId is provided, save the ASINs as products
    if (storefrontId && asins.length > 0) {
      // Get existing products to avoid duplicates
      const { data: existingProducts } = await supabase
        .from('products')
        .select('asin')
        .eq('storefront_id', storefrontId);

      const existingAsins = new Set(existingProducts?.map(p => p.asin) || []);
      const newAsins = asins.filter(asin => !existingAsins.has(asin));

      if (newAsins.length > 0) {
        // Insert new products
        const productsToInsert = newAsins.map(asin => ({
          storefront_id: storefrontId,
          asin: asin,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: insertError } = await supabase
          .from('products')
          .insert(productsToInsert);

        if (insertError) {
          console.error('Error inserting products:', insertError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      seller: {
        id: sellerInfo.sellerId,
        name: sellerInfo.name
      },
      totalAsins: asins.length,
      asins: asins.slice(0, 10), // Return first 10 ASINs as preview
      message: storefrontId ? `Found ${asins.length} ASINs and added to storefront` : `Found ${asins.length} ASINs`
    });

  } catch (error) {
    console.error('Error fetching seller ASINs:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch seller ASINs' },
      { status: 500 }
    );
  }
}