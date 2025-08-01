import { NextRequest, NextResponse } from 'next/server';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
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

    // Parse request body
    const { asins, marketplaceId, itemType = 'Asin', customerType } = await request.json();
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: 'ASINs array is required' },
        { status: 400 }
      );
    }

    if (asins.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 ASINs per request' },
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
      marketplaceId: marketplaceId || process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    const pricingClient = new SPAPICompetitivePricingClient(credentials, config);

    // Get competitive pricing data
    const products = await pricingClient.getCompetitivePricing(
      asins,
      config.marketplaceId,
      itemType,
      customerType
    );

    // Format response
    const formattedProducts = products.map(product => {
      const competitivePrices = product.competitivePricing?.competitivePrices || [];
      const numberOfOfferListings = product.competitivePricing?.numberOfOfferListings || [];
      const salesRankings = product.salesRankings || [];
      
      // Find lowest price
      const lowestPrice = competitivePrices
        .filter(cp => cp.condition === 'New')
        .sort((a, b) => a.price.amount - b.price.amount)[0];
      
      // Find buy box price
      const buyBoxPrice = competitivePrices.find(cp => 
        cp.competitivePriceId === 'B2C' && cp.belongsToRequester === false
      );

      return {
        asin: product.asin,
        marketplaceId: product.marketplaceId,
        competitivePrices: competitivePrices.map(cp => ({
          id: cp.competitivePriceId,
          price: cp.price,
          condition: cp.condition,
          subcondition: cp.subcondition,
          offerType: cp.offerType,
          belongsToRequester: cp.belongsToRequester
        })),
        lowestPrice: lowestPrice?.price,
        buyBoxPrice: buyBoxPrice?.price,
        numberOfOffers: numberOfOfferListings.reduce((acc, listing) => ({
          ...acc,
          [listing.condition]: listing.count
        }), {}),
        salesRankings: salesRankings.map(rank => ({
          category: rank.productCategoryId,
          rank: rank.rank
        })),
        tradeInValue: product.competitivePricing?.tradeInValue
      };
    });

    return NextResponse.json({
      success: true,
      products: formattedProducts,
      requestedAsins: asins,
      returnedCount: formattedProducts.length
    });

  } catch (error: any) {
    console.error('Error getting competitive pricing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get competitive pricing' },
      { status: 500 }
    );
  }
}