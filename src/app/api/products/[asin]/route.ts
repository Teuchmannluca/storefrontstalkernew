import { NextRequest, NextResponse } from 'next/server';
import SPAPIClient from '@/lib/sp-api';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    // Verify user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asin } = await params;
    
    // Validate ASIN format (basic validation)
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json({ error: 'Invalid ASIN format' }, { status: 400 });
    }

    // Get SP-API credentials from environment variables
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

    // Check if credentials are configured
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !config.clientId || !config.refreshToken) {
      return NextResponse.json(
        { error: 'SP-API credentials not configured' },
        { status: 500 }
      );
    }

    // Initialize SP-API client
    const spApiClient = new SPAPIClient(credentials, config);
    
    // Fetch product details
    const productDetails = await spApiClient.getProductByASIN(asin);
    
    return NextResponse.json(productDetails);
  } catch (error) {
    console.error('Error fetching product details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product details' },
      { status: 500 }
    );
  }
}