import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KeepaProductService } from '@/services/keepa-product-service';

export async function GET(request: NextRequest) {
  console.log('🔄 Keepa background enrichment job started');
  
  try {
    // Verify cron authentication
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const keepaApiKey = process.env.KEEPA_API_KEY;
    if (!keepaApiKey) {
      console.log('⚠️ KEEPA_API_KEY not configured');
      return NextResponse.json({ 
        message: 'Keepa API key not configured',
        enriched: 0 
      });
    }
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Get products that need Keepa data (no keepa_last_updated or older than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: products, error } = await supabase
      .from('products')
      .select('asin, user_id')
      .or(`keepa_last_updated.is.null,keepa_last_updated.lt.${twentyFourHoursAgo}`)
      .limit(20); // Process 20 products per run (40 tokens)
    
    if (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
    
    if (!products || products.length === 0) {
      console.log('✅ No products need Keepa enrichment');
      return NextResponse.json({ 
        message: 'No products need enrichment',
        enriched: 0 
      });
    }
    
    console.log(`📦 Found ${products.length} products to enrich`);
    
    // Group products by user
    const productsByUser = products.reduce((acc: any, product) => {
      if (!acc[product.user_id]) {
        acc[product.user_id] = [];
      }
      acc[product.user_id].push(product.asin);
      return acc;
    }, {});
    
    let totalEnriched = 0;
    
    // Process each user's products
    for (const [userId, asins] of Object.entries(productsByUser)) {
      try {
        const keepaService = new KeepaProductService(keepaApiKey, userId, 2); // UK domain
        
        // Check token availability
        const tokenStatus = await keepaService.getTokenStatus();
        const estimateInfo = await keepaService.estimateProcessingTime((asins as string[]).length, true);
        
        console.log(`User ${userId}: ${tokenStatus.availableTokens} tokens available, ${estimateInfo.tokensNeeded} needed`);
        
        if (tokenStatus.availableTokens < estimateInfo.tokensNeeded) {
          console.log(`⏳ Not enough tokens for user ${userId}, skipping`);
          continue;
        }
        
        // Enrich products with Keepa data
        const enrichedProducts = await keepaService.enrichProducts(asins as string[], true);
        
        // Update products in database
        for (const enriched of enrichedProducts) {
          if (enriched.keepaData) {
            const { error: updateError } = await supabase
              .from('products')
              .update({
                keepa_sales_drops_30d: enriched.keepaData.salesDrops30d,
                keepa_sales_drops_90d: enriched.keepaData.salesDrops90d,
                keepa_estimated_sales: enriched.keepaData.estimatedMonthlySales,
                keepa_buy_box_win_rate: enriched.keepaData.buyBoxWinRate,
                keepa_competitor_count: enriched.keepaData.competitorCount,
                keepa_graph_url: enriched.graphUrl,
                keepa_last_updated: new Date().toISOString(),
                sales_per_month: enriched.keepaData.estimatedMonthlySales || 0
              })
              .eq('asin', enriched.asin)
              .eq('user_id', userId);
            
            if (updateError) {
              console.error(`Error updating product ${enriched.asin}:`, updateError);
            } else {
              totalEnriched++;
            }
          }
        }
        
      } catch (error) {
        console.error(`Error processing user ${userId}:`, error);
      }
    }
    
    console.log(`✅ Enriched ${totalEnriched} products with Keepa data`);
    
    return NextResponse.json({ 
      message: 'Keepa enrichment completed',
      enriched: totalEnriched,
      processed: products.length 
    });
    
  } catch (error) {
    console.error('Keepa enrichment job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}