import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ asin: string }> }
) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Get ASIN from route params
    const { asin } = await context.params;
    
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
      return NextResponse.json(
        { error: 'Invalid ASIN format' },
        { status: 400 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const marketplace = searchParams.get('marketplace');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '100');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query
    let query = supabase
      .from('asin_price_history')
      .select('*')
      .eq('user_id', user.id)
      .eq('asin', asin.toUpperCase())
      .order('change_detected_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (marketplace) {
      query = query.eq('marketplace', marketplace);
    }

    if (startDate) {
      query = query.gte('change_detected_at', startDate);
    }

    if (endDate) {
      query = query.lte('change_detected_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching price history:', error);
      return NextResponse.json(
        { error: 'Failed to fetch price history' },
        { status: 500 }
      );
    }

    // Get summary statistics
    const { data: summary } = await supabase
      .rpc('get_asin_price_history_summary', {
        p_user_id: user.id,
        p_asin: asin.toUpperCase()
      });

    return NextResponse.json({
      asin: asin.toUpperCase(),
      history: data || [],
      summary: summary || [],
      totalRecords: data?.length || 0
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    console.error('[API_ERROR] /api/price-history/[asin]:', error);
    return NextResponse.json(
      { error: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
}