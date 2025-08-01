import { NextRequest, NextResponse } from 'next/server';
import { SPAPIProductFeesClient } from '@/lib/sp-api-product-fees';

export async function GET(request: NextRequest) {
  try {
    console.log('=== Debug Product Fees API ===');
    
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION || 'eu-west-1',
    };
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
      region: 'eu' as const,
    };

    console.log('Environment check:');
    console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING');
    console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING');
    console.log('AMAZON_ACCESS_KEY_ID:', process.env.AMAZON_ACCESS_KEY_ID ? 'SET' : 'MISSING');
    console.log('AMAZON_SECRET_ACCESS_KEY:', process.env.AMAZON_SECRET_ACCESS_KEY ? 'SET' : 'MISSING');
    console.log('AMAZON_REFRESH_TOKEN:', process.env.AMAZON_REFRESH_TOKEN ? 'SET' : 'MISSING');
    console.log('AMAZON_MARKETPLACE_ID:', process.env.AMAZON_MARKETPLACE_ID);
    console.log('AWS_REGION:', process.env.AWS_REGION);

    const feesClient = new SPAPIProductFeesClient(credentials, config);

    const priceToEstimateFees = {
      listingPrice: {
        currencyCode: 'GBP',
        amount: 15.00
      }
    };

    console.log('Making fees estimate request for ASIN: B0006NZ3Y4');
    console.log('Price to estimate:', priceToEstimateFees);
    console.log('Marketplace:', config.marketplaceId);

    const feesEstimate = await feesClient.getMyFeesEstimateForASIN(
      'B0006NZ3Y4',
      priceToEstimateFees,
      config.marketplaceId
    );

    console.log('=== Fees Estimate Response ===');
    console.log(JSON.stringify(feesEstimate, null, 2));

    return NextResponse.json({
      success: true,
      debug: {
        credentials: {
          region: credentials.region,
          accessKeyId: credentials.accessKeyId ? '***' : 'MISSING'
        },
        config: {
          marketplaceId: config.marketplaceId,
          region: config.region,
          clientId: config.clientId ? '***' : 'MISSING'
        },
        request: {
          asin: 'B0006NZ3Y4',
          priceToEstimateFees
        }
      },
      result: feesEstimate
    });

  } catch (error: any) {
    console.error('=== Debug Fees API Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.response) {
      console.error('HTTP Status:', error.response.status);
      console.error('Response Data:', error.response.data);
      console.error('Response Headers:', error.response.headers);
    }

    return NextResponse.json({
      success: false,
      error: error.message,
      details: {
        stack: error.stack,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        } : null
      }
    }, { status: 500 });
  }
}