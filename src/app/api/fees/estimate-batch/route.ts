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
    const { requests } = await request.json();
    
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return NextResponse.json(
        { error: 'Requests array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    if (requests.length > 20) {
      return NextResponse.json(
        { error: 'Maximum 20 items per batch request' },
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
      sellerId: process.env.AMAZON_SELLER_ID!,
      region: 'eu' as const,
    };

    const feesClient = new SPAPIProductFeesClient(credentials, config);

    // Prepare batch requests
    const feesEstimateRequests = requests.map(req => ({
      idType: req.idType || 'ASIN' as const,
      idValue: req.asin || req.sku,
      priceToEstimateFees: {
        listingPrice: {
          currencyCode: req.currency || 'GBP',
          amount: parseFloat(req.price)
        },
        ...(req.shipping && {
          shipping: {
            currencyCode: req.currency || 'GBP',
            amount: parseFloat(req.shipping)
          }
        })
      },
      marketplaceId: config.marketplaceId,
      identifier: req.identifier,
      optionalFulfillmentProgram: req.fulfillmentProgram
    }));

    // Get batch fees estimates
    const feesEstimates = await feesClient.getMyFeesEstimates(feesEstimateRequests);

    // Format responses
    const results = feesEstimates.map((estimate, index) => {
      const request = requests[index];
      
      if (estimate.status === 'Success' && estimate.feesEstimate) {
        const fees = estimate.feesEstimate;
        const feeDetails = fees.feeDetailList || [];
        
        return {
          success: true,
          idType: estimate.feesEstimateIdentifier.idType,
          idValue: estimate.feesEstimateIdentifier.idValue,
          price: estimate.feesEstimateIdentifier.priceToEstimateFees.listingPrice,
          shipping: estimate.feesEstimateIdentifier.priceToEstimateFees.shipping,
          fees: {
            referralFee: feeDetails.find(f => f.feeType === 'ReferralFee')?.finalFee,
            variableClosingFee: feeDetails.find(f => f.feeType === 'VariableClosingFee')?.finalFee,
            fbaFees: feeDetails.find(f => f.feeType.includes('FBA'))?.finalFee,
            totalFees: fees.totalFeesEstimate,
            allFees: feeDetails.map(fee => ({
              type: fee.feeType,
              amount: fee.finalFee,
              promotion: fee.feePromotion
            }))
          },
          estimatedAt: fees.timeOfFeesEstimation
        };
      } else {
        return {
          success: false,
          idType: request.idType || 'ASIN',
          idValue: request.asin || request.sku,
          error: estimate.error?.message || 'Failed to get fees estimate',
          details: estimate.error
        };
      }
    });

    return NextResponse.json({
      success: true,
      results,
      totalRequested: requests.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

  } catch (error) {
    console.error('Error estimating batch fees:', error);
    return NextResponse.json(
      { error: 'Failed to estimate batch fees' },
      { status: 500 }
    );
  }
}