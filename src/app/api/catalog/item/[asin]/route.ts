import { NextRequest, NextResponse } from 'next/server';
import { SPAPICatalogClient } from '@/lib/sp-api-catalog';

export async function GET(
  request: NextRequest,
  { params }: { params: { asin: string } }
) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const asin = params.asin;
    
    // Validate ASIN format
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json(
        { error: 'Invalid ASIN format' },
        { status: 400 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const includedDataParam = searchParams.get('includedData');
    
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
    const includedData = includedDataParam ? includedDataParam.split(',') : [
      'attributes',
      'identifiers', 
      'images',
      'productTypes',
      'salesRanks',
      'summaries',
      'dimensions'
    ];

    const catalogItem = await catalogClient.getCatalogItem(
      asin,
      [config.marketplaceId],
      includedData
    );

    // Transform to simpler format
    const marketplaceData = {
      summary: catalogItem.summaries?.find(s => s.marketplaceId === config.marketplaceId),
      images: catalogItem.images?.find(i => i.marketplaceId === config.marketplaceId)?.images || [],
      salesRanks: catalogItem.salesRanks?.find(s => s.marketplaceId === config.marketplaceId)?.ranks || [],
      dimensions: catalogItem.dimensions?.find(d => d.marketplaceId === config.marketplaceId)
    };

    const productDetails = {
      asin: catalogItem.asin,
      title: marketplaceData.summary?.itemName || 'Unknown Product',
      brand: marketplaceData.summary?.brandName,
      manufacturer: marketplaceData.summary?.manufacturer,
      modelNumber: marketplaceData.summary?.modelNumber,
      color: marketplaceData.summary?.colorName,
      size: marketplaceData.summary?.sizeName,
      style: marketplaceData.summary?.styleName,
      mainImage: marketplaceData.images.find(img => img.variant === 'MAIN')?.link,
      images: marketplaceData.images.map(img => ({
        url: img.link,
        variant: img.variant,
        height: img.height,
        width: img.width
      })),
      salesRank: marketplaceData.salesRanks[0]?.rank,
      salesRankCategory: marketplaceData.salesRanks[0]?.title,
      salesRankLink: marketplaceData.salesRanks[0]?.link,
      dimensions: {
        item: marketplaceData.dimensions?.item,
        package: marketplaceData.dimensions?.package
      },
      productTypes: catalogItem.productTypes,
      identifiers: catalogItem.identifiers,
      attributes: catalogItem.attributes
    };

    return NextResponse.json({
      success: true,
      product: productDetails
    });

  } catch (error) {
    console.error('Get catalog item error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to get catalog item' },
      { status: 500 }
    );
  }
}