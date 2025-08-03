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
      // SP-API client transforms the data structure - check both formats
      const competitivePrices = (product.competitivePricing as any)?.CompetitivePrices || product.competitivePricing?.competitivePrices || [];
      const numberOfOfferListings = (product.competitivePricing as any)?.NumberOfOfferListings || product.competitivePricing?.numberOfOfferListings || [];
      const salesRankings = product.salesRankings || [];
      
      // IMPORTANT: Filter out USED products - only consider NEW condition
      const newConditionPrices = competitivePrices.filter((cp: any) => 
        cp.condition === 'New' || cp.condition === 'new' || !cp.condition
      );
      
      // Find buy box price (most important for arbitrage) - NEW only
      const buyBoxPrice = newConditionPrices.find((cp: any) => 
        cp.CompetitivePriceId === '1' || cp.competitivePriceId === '1'
      );
      
      // Find featured offer price as fallback - NEW only
      const featuredOfferPrice = newConditionPrices.find((cp: any) => 
        cp.CompetitivePriceId === 'B2C' || cp.competitivePriceId === 'B2C' || 
        cp.CompetitivePriceId === '2' || cp.competitivePriceId === '2'
      );
      
      // Use buy box price or featured offer price or first available NEW item
      const mainPrice = buyBoxPrice || featuredOfferPrice || newConditionPrices[0];

      return {
        asin: product.asin,
        marketplaceId: product.marketplaceId,
        totalCompetitivePrices: competitivePrices.length,
        newConditionPricesCount: newConditionPrices.length,
        hasNewPrices: newConditionPrices.length > 0,
        competitivePrices: competitivePrices.map((cp: any) => ({
          id: cp.CompetitivePriceId || cp.competitivePriceId,
          price: cp.Price || cp.price,
          condition: cp.condition,
          subcondition: cp.subcondition,
          offerType: cp.offerType,
          belongsToRequester: cp.belongsToRequester
        })),
        newConditionPrices: newConditionPrices.map((cp: any) => ({
          id: cp.CompetitivePriceId || cp.competitivePriceId,
          price: cp.Price || cp.price,
          condition: cp.condition
        })),
        buyBoxPrice: buyBoxPrice?.Price || buyBoxPrice?.price,
        featuredOfferPrice: featuredOfferPrice?.Price || featuredOfferPrice?.price,
        mainPrice: mainPrice?.Price || mainPrice?.price,
        warning: newConditionPrices.length === 0 ? 'No NEW condition prices available - product will be skipped in arbitrage analysis' : null,
        numberOfOffers: numberOfOfferListings.reduce((acc: any, listing: any) => ({
          ...acc,
          [listing.condition]: listing.Count || listing.count
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
      returnedCount: formattedProducts.length,
      timestamp: Date.now() // Ensure fresh data
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error: any) {
    console.error('Error getting competitive pricing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get competitive pricing' },
      { status: 500 }
    );
  }
}