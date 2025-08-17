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

    // Fetch all opportunities found so far
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
        all_marketplace_prices,
        keepa_sales_data,
        keepa_graph_url
      `)
      .eq('scan_id', scanId)
      .order('best_roi', { ascending: false });

    // Fetch price history for the opportunities
    let opportunitiesWithPriceHistory = opportunities || [];
    if (opportunities && opportunities.length > 0) {
      const asins = opportunities.map((opp: any) => opp.asin);
      
      // Get UK price history
      const { data: ukPriceHistory } = await supabase
        .from('asin_price_history')
        .select('asin, old_price, new_price, price_change_amount, price_change_percentage, is_first_check, change_detected_at')
        .in('asin', asins)
        .eq('marketplace', 'UK')
        .eq('scan_id', scanId);
      
      // Get EU price history for best marketplace
      const { data: euPriceHistory } = await supabase
        .from('asin_price_history')
        .select('asin, marketplace, old_price, new_price, price_change_amount, price_change_percentage, is_first_check, change_detected_at')
        .in('asin', asins)
        .neq('marketplace', 'UK')
        .eq('scan_id', scanId);
      
      // Also get product changes data for new/old product information
      const { data: productChanges } = await supabase
        .from('products_with_changes')
        .select('asin, previous_price, price, price_change_percentage, first_seen_date, last_checked')
        .in('asin', asins);
      
      // Merge price history data with opportunities
      opportunitiesWithPriceHistory = opportunities.map((opp: any) => {
        const ukHistory = ukPriceHistory?.find((h: any) => h.asin === opp.asin);
        const euHistory = euPriceHistory?.find((h: any) => h.asin === opp.asin && h.marketplace === opp.best_source_marketplace);
        const productChange = productChanges?.find((p: any) => p.asin === opp.asin);
        
        const priceHistory: any = {};
        
        if (ukHistory) {
          priceHistory.uk = {
            oldPrice: ukHistory.old_price,
            newPrice: ukHistory.new_price,
            changeAmount: ukHistory.price_change_amount,
            changePercentage: ukHistory.price_change_percentage,
            isFirstCheck: ukHistory.is_first_check,
            lastChecked: ukHistory.change_detected_at
          };
        }
        
        if (euHistory) {
          priceHistory.bestEu = {
            oldPrice: euHistory.old_price,
            newPrice: euHistory.new_price,
            changeAmount: euHistory.price_change_amount,
            changePercentage: euHistory.price_change_percentage,
            isFirstCheck: euHistory.is_first_check,
            lastChecked: euHistory.change_detected_at,
            marketplace: euHistory.marketplace
          };
        }
        
        return {
          ...opp,
          priceHistory: Object.keys(priceHistory).length > 0 ? priceHistory : undefined,
          isNewProduct: productChange?.first_seen_date ? 
            new Date(productChange.first_seen_date).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000) : // New if seen within last 7 days
            false
        };
      });
    }

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
      opportunities: opportunitiesWithPriceHistory,
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