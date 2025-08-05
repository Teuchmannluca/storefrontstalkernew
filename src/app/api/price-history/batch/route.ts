import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Parse request body
    const body = await request.json();
    const { asins, marketplace, include_summary = false } = body;

    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: 'ASINs array is required' },
        { status: 400 }
      );
    }

    // Validate ASINs
    const validAsins = asins
      .filter((asin: string) => /^[A-Z0-9]{10}$/i.test(asin))
      .map((asin: string) => asin.toUpperCase());

    if (validAsins.length === 0) {
      return NextResponse.json(
        { error: 'No valid ASINs provided' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use the view to get latest prices for all ASINs
    let query = supabase
      .from('latest_asin_price_history')
      .select('*')
      .eq('user_id', user.id)
      .in('asin', validAsins);

    if (marketplace) {
      query = query.eq('marketplace', marketplace);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching batch price history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch price history' },
        { status: 500 }
      );
    }

    // Organize data by ASIN
    const pricesByAsin: Record<string, any> = {};
    
    (data || []).forEach((entry: any) => {
      if (!pricesByAsin[entry.asin]) {
        pricesByAsin[entry.asin] = {
          asin: entry.asin,
          product_name: entry.product_name,
          marketplaces: {}
        };
      }
      
      pricesByAsin[entry.asin].marketplaces[entry.marketplace] = {
        current_price: entry.new_price,
        previous_price: entry.old_price,
        currency: entry.new_price_currency,
        price_change_amount: entry.price_change_amount,
        price_change_percentage: entry.price_change_percentage,
        last_checked: entry.change_detected_at,
        is_first_check: entry.is_first_check
      };
    });

    // Get summaries if requested
    let summaries: Record<string, any> = {};
    if (include_summary) {
      for (const asin of validAsins) {
        const { data: summary } = await supabase
          .rpc('get_asin_price_history_summary', {
            p_user_id: user.id,
            p_asin: asin
          });
        
        if (summary && summary.length > 0) {
          summaries[asin] = summary;
        }
      }
    }

    return NextResponse.json({
      asins: validAsins,
      prices: pricesByAsin,
      summaries: include_summary ? summaries : undefined
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    console.error('[API_ERROR] /api/price-history/batch:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
}