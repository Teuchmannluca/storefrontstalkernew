import { NextRequest, NextResponse } from 'next/server';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keywords, brandNames, pageSize = 10, pageToken, includedData } = await request.json();

    if (!keywords && !brandNames) {
      return NextResponse.json(
        { error: 'Either keywords or brandNames must be provided' },
        { status: 400 }
      );
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
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P', // UK marketplace
      region: 'eu',
    };

    const catalogClient = new SPAPICatalogClient(credentials, config);

    // Default included data if not specified
    const defaultIncludedData = [
      'attributes',
      'identifiers', 
      'images',
      'productTypes',
      'salesRanks',
      'summaries',
      'dimensions'
    ];

    const searchParams = {
      keywords,
      marketplaceIds: [config.marketplaceId],
      includedData: includedData || defaultIncludedData,
      brandNames,
      pageSize,
      pageToken,
      locale: 'en_GB'
    };

    const results = await catalogClient.searchCatalogItems(searchParams);

    // Transform results to simpler format
    const items = results.items.map(item => {
      const marketplaceData = {
        summary: item.summaries?.find(s => s.marketplaceId === config.marketplaceId),
        images: item.images?.find(i => i.marketplaceId === config.marketplaceId)?.images || [],
        salesRanks: item.salesRanks?.find(s => s.marketplaceId === config.marketplaceId)?.ranks || [],
        dimensions: item.dimensions?.find(d => d.marketplaceId === config.marketplaceId)
      };

      return {
        asin: item.asin,
        title: marketplaceData.summary?.itemName || 'Unknown Product',
        brand: marketplaceData.summary?.brandName,
        manufacturer: marketplaceData.summary?.manufacturer,
        modelNumber: marketplaceData.summary?.modelNumber,
        mainImage: marketplaceData.images.find(img => img.variant === 'MAIN')?.link,
        images: marketplaceData.images,
        salesRank: marketplaceData.salesRanks[0]?.rank,
        salesRankCategory: marketplaceData.salesRanks[0]?.title,
        dimensions: marketplaceData.dimensions,
        productTypes: item.productTypes,
        attributes: item.attributes
      };
    });

    return NextResponse.json({
      success: true,
      numberOfResults: results.numberOfResults,
      items,
      pagination: results.pagination,
      refinements: results.refinements
    });

  } catch (error) {
    console.error('Catalog search error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to search catalog' },
      { status: 500 }
    );
  }
}