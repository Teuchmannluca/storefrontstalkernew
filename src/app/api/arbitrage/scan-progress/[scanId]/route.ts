import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ scanId: string }> }
) {
  try {
    // Await the params promise (Next.js 15 requirement)
    const { scanId } = await context.params;
    
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Fetch scan details
    const { data: scan, error: scanError } = await supabase
      .from('arbitrage_scans')
      .select('*')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .single();

    if (scanError || !scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      );
    }

    // Fetch opportunities found so far (limited to last 100 to avoid huge payloads)
    const { data: opportunities, error: oppsError } = await supabase
      .from('arbitrage_opportunities')
      .select(`
        asin,
        product_name,
        product_image,
        target_price,
        amazon_fees,
        referral_fee,
        digital_services_fee,
        uk_competitors,
        uk_sales_rank,
        sales_per_month,
        best_source_marketplace,
        best_source_price,
        best_source_price_gbp,
        best_profit,
        best_roi,
        profit_category,
        all_marketplace_prices
      `)
      .eq('scan_id', scanId)
      .order('best_roi', { ascending: false })
      .limit(100);

    if (oppsError) {
      console.error('Error fetching opportunities:', oppsError);
    }

    // Calculate estimated time remaining (if in progress)
    let estimatedTimeRemaining = null;
    if (scan.status === 'running' && scan.progress_percentage > 0) {
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(scan.started_at).getTime()) / 1000
      );
      const progressRate = scan.progress_percentage / elapsedSeconds;
      if (progressRate > 0) {
        const remainingProgress = 100 - scan.progress_percentage;
        estimatedTimeRemaining = Math.round(remainingProgress / progressRate);
      }
    }

    // Format response
    const response = {
      scan: {
        id: scan.id,
        status: scan.status,
        scan_type: scan.scan_type,
        storefront_name: scan.storefront_name,
        started_at: scan.started_at,
        completed_at: scan.completed_at,
        error_message: scan.error_message,
        progress_percentage: scan.progress_percentage || 0,
        current_step: scan.current_step || 'Initializing...',
        processed_count: scan.processed_count || 0,
        total_products: scan.total_products,
        unique_asins: scan.unique_asins,
        opportunities_found: scan.opportunities_found || 0,
        last_updated: scan.last_updated,
        metadata: scan.metadata
      },
      opportunities: opportunities || [],
      estimatedTimeRemaining
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Scan progress error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}