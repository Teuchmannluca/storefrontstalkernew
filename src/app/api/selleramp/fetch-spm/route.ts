import { NextRequest, NextResponse } from 'next/server';
import { getSellerAmpScraper, SellerAmpRequest } from '@/services/selleramp-scraper';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per hour per user
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }

  userLimit.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { asin, costPrice, salePrice, username, password } = body;

    // Validate required fields
    if (!asin || !costPrice || !salePrice || !username || !password) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: asin, costPrice, salePrice, username, password' 
        },
        { status: 400 }
      );
    }

    // Validate ASIN format
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid ASIN format. Must be 10 alphanumeric characters.' 
        },
        { status: 400 }
      );
    }

    // Validate price values
    if (typeof costPrice !== 'number' || typeof salePrice !== 'number' || costPrice <= 0 || salePrice <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cost price and sale price must be positive numbers' 
        },
        { status: 400 }
      );
    }

    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Service temporarily unavailable' 
        },
        { status: 503 }
      );
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Check rate limiting
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Rate limit exceeded. Maximum ${RATE_LIMIT} requests per hour.` 
        },
        { status: 429 }
      );
    }

    // Check cache first
    const { data: cachedResult, error: cacheError } = await supabase
      .from('selleramp_spm_cache')
      .select('*')
      .eq('asin', asin)
      .eq('user_id', user.id)
      .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // 1 hour cache
      .single();

    if (!cacheError && cachedResult) {
      console.log(`Returning cached SPM for ${asin}: ${cachedResult.spm_value}`);
      return NextResponse.json({
        success: true,
        spm: cachedResult.spm_value,
        source: 'selleramp-cache',
        cached: true
      });
    }

    // Prepare scraper request
    const scraperRequest: SellerAmpRequest = {
      asin,
      costPrice: Number(costPrice),
      salePrice: Number(salePrice),
      credentials: {
        username: String(username),
        password: String(password)
      }
    };

    // Get scraper instance and fetch SPM
    console.log(`Fetching SPM from SellerAmp for ASIN: ${asin}`);
    const scraper = await getSellerAmpScraper();
    const result = await scraper.fetchSPM(scraperRequest);

    if (result.success && result.spm) {
      // Cache the result
      try {
        await supabase
          .from('selleramp_spm_cache')
          .upsert({
            asin,
            spm_value: result.spm,
            user_id: user.id,
            cost_price: costPrice,
            sale_price: salePrice,
            fetched_at: new Date().toISOString()
          });
      } catch (cacheInsertError) {
        console.warn('Failed to cache SPM result:', cacheInsertError);
        // Don't fail the request if caching fails
      }

      console.log(`Successfully fetched SPM for ${asin}: ${result.spm}`);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('SellerAmp API error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
        source: 'selleramp'
      },
      { status: 500 }
    );
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}