import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase-server';
import SPAPIClient from '@/lib/sp-api';
import { estimateMonthlySalesFromRank } from '@/lib/sales-estimator';

export async function POST(request: NextRequest) {
  try {
    const { storefrontId } = await request.json();
    
    if (!storefrontId) {
      return NextResponse.json(
        { error: 'Storefront ID is required' },
        { status: 400 }
      );
    }

    // Fetch all products for this storefront from Supabase
    const supabase = getServiceRoleClient();
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, asin, product_name, brand, image_link, current_sales_rank')
      .eq('storefront_id', storefrontId);

    if (fetchError) {
      console.error('Error fetching products:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch products from database' },
        { status: 500 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products found for this storefront',
        updated: 0
      });
    }

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
    };

    const spApi = new SPAPIClient(credentials, config);

    // Process products in batches of 5 to avoid rate limits
    const batchSize = 5;
    const results = [];
    let updatedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      // Process each product in the batch
      const batchPromises = batch.map(async (product) => {
        try {
          console.log(`Fetching details for ASIN: ${product.asin}`);
          const productDetails = await spApi.getProductByASIN(product.asin);
          
          // Prepare update data
          const salesRank = productDetails.salesRanks[0]?.rank || null;
          const updateData = {
            product_name: productDetails.title || product.product_name,
            brand: productDetails.brand || product.brand,
            image_link: productDetails.mainImage || product.image_link,
            current_sales_rank: salesRank,
            sales_rank_category: productDetails.salesRanks[0]?.category || null,
            sales_per_month: salesRank ? estimateMonthlySalesFromRank(salesRank) : null,
            last_checked: new Date().toISOString()
          };

          // Update in database
          const { error: updateError } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', product.id);

          if (updateError) {
            console.error(`Error updating product ${product.asin}:`, updateError);
            errorCount++;
            return {
              asin: product.asin,
              success: false,
              error: updateError.message
            };
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

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add a small delay between batches to avoid rate limits
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      totalProducts: products.length,
      updated: updatedCount,
      errors: errorCount,
      results: results
    });

  } catch (error: any) {
    console.error('Error syncing storefront products:', error);
    return NextResponse.json(
      { 
        error: 'Failed to sync products',
        details: error.message 
      },
      { status: 500 }
    );
  }
}