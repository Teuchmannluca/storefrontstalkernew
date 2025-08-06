import { NextRequest, NextResponse } from 'next/server';
import { KeepaStorefrontAPI } from '@/lib/keepa-storefront';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    await requireAuth();
    
    // Initialize Keepa API
    const keepaApiKey = process.env.KEEPA_API_KEY;
    if (!keepaApiKey) {
      return NextResponse.json(
        { error: 'Keepa API key not configured' },
        { status: 500 }
      );
    }

    const keepaDomain = parseInt(process.env.KEEPA_DOMAIN || '2');
    const keepaStorefront = new KeepaStorefrontAPI(keepaApiKey, keepaDomain);

    // Don't make unnecessary API calls - just return estimated tokens
    // Token count will be updated from actual sync operations
    const availableTokens = keepaStorefront.getAvailableTokens();
    
    return NextResponse.json({
      success: true,
      availableTokens,
      regenerationRate: 22, // tokens per minute
      tokensPerStorefront: 50,
      storefrontsCanProcess: Math.floor(availableTokens / 50),
      maxTokens: 1320, // Your subscription max tokens
      info: 'Current tokens from your Keepa subscription, regenerating at 22/minute'
    });

  } catch (error) {
    console.error('Error checking Keepa tokens:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to check Keepa tokens' },
      { status: 500 }
    );
  }
}