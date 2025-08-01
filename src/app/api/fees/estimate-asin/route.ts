import { NextRequest, NextResponse } from 'next/server';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';
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
    const { asin, price, currency = 'GBP', shipping, fulfillmentProgram } = await request.json();
    
    if (!asin || !price) {
      return NextResponse.json(
        { error: 'ASIN and price are required' },
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
      region: 'eu' as const,
    };

    const feesClient = new SPAPIProductFeesClient(credentials, config);

    // Prepare price data
    const priceToEstimateFees = {
      listingPrice: {
        currencyCode: currency,
        amount: parseFloat(price)
      },
      ...(shipping && {
        shipping: {
          currencyCode: currency,
          amount: parseFloat(shipping)
        }
      })
    };

    // Get fees estimate
    const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      asin,
      priceToEstimateFees,
      config.marketplaceId,
      undefined,
      fulfillmentProgram
    );

    // Return formatted response
    if (feesEstimate.status === 'Success' && feesEstimate.feesEstimate) {
      const fees = feesEstimate.feesEstimate;
      const feeDetails = fees.feeDetailList || [];
      
      // Calculate breakdown
      const breakdown = {
        referralFee: feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee,
        variableClosingFee: feeDetails.find(f => f.feeType === 'VariableClosingFee')?.finalFee,
        fbaFees: feeDetails.find(f => f.feeType.includes('FBA'))?.finalFee,
        totalFees: fees.totalFeesEstimate,
        allFees: feeDetails.map(fee => ({
          type: fee.feeType,
          amount: fee.finalFee,
          promotion: fee.feePromotion
        }))
      };

      return NextResponse.json({
        success: true,
        asin,
        price: priceToEstimateFees.listingPrice,
        shipping: priceToEstimateFees.shipping,
        fees: breakdown,
        estimatedAt: fees.timeOfFeesEstimation
      });
    } else if (feesEstimate.error) {
      return NextResponse.json({
        success: false,
        error: feesEstimate.error.message,
        details: feesEstimate.error
      }, { status: 400 });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to get fees estimate'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error estimating fees:', error);
    return NextResponse.json(
      { error: 'Failed to estimate fees' },
      { status: 500 }
    );
  }
}