import { NextRequest, NextResponse } from 'next/server';
import { SPAPICompetitivePricingClient } from '@/lib/sp-api-competitive-pricing';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
    const { requests } = await request.json();
    
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return NextResponse.json(
        { error: 'Requests array is required' },
        { status: 400 }
      );
    }

    if (requests.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 requests per batch' },
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
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    const pricingClient = new SPAPICompetitivePricingClient(credentials, config);

    // Get batch item offers
    const batchResponse = await pricingClient.getItemOffersBatch(requests);

    // Format responses
    const results = batchResponse.responses.map((response, index) => {
      const request = requests[index];
      
      if (response.status.statusCode !== 200) {
        return {
          success: false,
          asin: request.asin,
          error: response.body?.errors?.[0]?.message || 'Request failed',
          statusCode: response.status.statusCode
        };
      }

      const product = response.body?.payload;
      if (!product) {
        return {
          success: false,
          asin: request.asin,
          error: 'No data returned'
        };
      }

      // Format offers
      const offers = product.offers?.map(offer => ({
        sellerId: offer.sellerId,
        price: offer.price,
        shipping: offer.shippingPrice,
        totalPrice: {
          currencyCode: offer.price.currencyCode,
          amount: offer.price.amount + (offer.shippingPrice?.amount || 0)
        },
        condition: offer.subCondition,
        shippingTime: offer.shippingTime,
        isBuyBoxWinner: offer.isBuyBoxWinner,
        isFeaturedMerchant: offer.isFeaturedMerchant,
        isPrime: offer.primeInformation?.isPrime,
        sellerRating: offer.sellerFeedbackRating ? {
          count: offer.sellerFeedbackRating.feedbackCount,
          rating: offer.sellerFeedbackRating.sellerPositiveFeedbackRating
        } : null
      })) || [];

      // Sort by total price
      offers.sort((a, b) => a.totalPrice.amount - b.totalPrice.amount);

      return {
        success: true,
        asin: product.asin || request.asin,
        marketplaceId: product.marketplaceId,
        summary: {
          totalOffers: product.summary?.totalOfferCount || 0,
          lowestPrice: product.summary?.lowestPrices?.[0],
          buyBoxPrice: product.summary?.buyBoxPrices?.[0],
          listPrice: product.summary?.listPrice,
          salesRankings: product.summary?.salesRankings || []
        },
        offers: offers.slice(0, 10), // Return top 10 offers per product
        requestedCondition: request.itemCondition || 'New'
      };
    });

    return NextResponse.json({
      success: true,
      results,
      totalRequested: requests.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      timestamp: Date.now() // Ensure fresh data
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error: any) {
    console.error('Error getting batch offers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get batch offers' },
      { status: 500 }
    );
  }
}