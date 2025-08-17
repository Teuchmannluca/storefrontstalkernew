import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { ValidationError } from '@/lib/validation';
import { AppError } from '@/lib/error-handling';
import { checkEnvVars } from '@/lib/env-check';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Validate request body
    const body = await request.json();
    
    if (!body.opportunities || !Array.isArray(body.opportunities) || body.opportunities.length === 0) {
      throw new ValidationError('Opportunities array is required', 'opportunities');
    }
    
    const { opportunities, listName, listId } = body;
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });
    
    if (!envCheck.success) {
      throw new AppError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
    
    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );
    
    let targetListId = listId;
    
    // Create new list if needed
    if (!targetListId && listName) {
      const { data: newList, error: listError } = await supabase
        .from('sourcing_lists')
        .insert({
          user_id: user.id,
          name: listName,
          description: `B2B Arbitrage opportunities saved on ${new Date().toLocaleDateString()}`,
          item_count: 0,
          list_type: 'b2b_arbitrage'
        })
        .select()
        .single();
      
      if (listError) {
        throw new AppError('Failed to create sourcing list', 500, 'LIST_CREATE_ERROR');
      }
      
      targetListId = newList.id;
    }
    
    if (!targetListId) {
      throw new ValidationError('Either listId or listName must be provided', 'listId');
    }
    
    // Prepare items for insertion
    const listItems = opportunities.map((opp: any) => ({
      list_id: targetListId,
      asin: opp.asin,
      product_name: opp.productName,
      product_image: opp.productImage,
      source_marketplace: 'UK_B2B', // Indicates B2B source
      target_marketplace: 'UK',
      source_price: opp.ukB2bPrice / 1.20, // Store ex-VAT price
      target_price: opp.ukB2cPrice,
      profit: opp.netProfit,
      roi: opp.roiPercentage,
      profit_margin: opp.profitMargin,
      sales_rank: opp.ukSalesRank,
      sales_per_month: opp.salesPerMonth,
      metadata: {
        b2b_price_inc_vat: opp.ukB2bPrice,
        b2b_price_ex_vat: opp.ukB2bPrice / 1.20,
        discount_percentage: opp.discountPercentage,
        amazon_fees: opp.amazonFees,
        vat_amount: opp.vatAmount,
        profit_category: opp.profitCategory,
        competitors_count: opp.competitorsCount,
        quantity_for_lowest_price: opp.quantityForLowestPrice || 1,
        quantity_tiers: opp.quantityTiers || null
      }
    }));
    
    // Insert items
    const { data: insertedItems, error: insertError } = await supabase
      .from('sourcing_list_items')
      .insert(listItems)
      .select();
    
    if (insertError) {
      console.error('Error inserting items:', insertError);
      throw new AppError('Failed to save opportunities to list', 500, 'SAVE_ERROR');
    }
    
    // Get current item count
    const { data: currentList } = await supabase
      .from('sourcing_lists')
      .select('item_count')
      .eq('id', targetListId)
      .single();
    
    // Update item count in the list
    const { error: updateError } = await supabase
      .from('sourcing_lists')
      .update({ 
        item_count: (currentList?.item_count || 0) + insertedItems.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetListId);
    
    if (updateError) {
      console.error('Error updating list count:', updateError);
    }
    
    // Get updated list info
    const { data: updatedList } = await supabase
      .from('sourcing_lists')
      .select('*')
      .eq('id', targetListId)
      .single();
    
    return NextResponse.json({
      success: true,
      listId: targetListId,
      listName: updatedList?.name || listName,
      itemsSaved: insertedItems.length,
      totalItems: updatedList?.item_count || insertedItems.length
    });
    
  } catch (error: any) {
    console.error('Save to list error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }
    
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 }
      );
    }
    
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}