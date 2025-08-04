import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

interface SourcingListItem {
  asin: string;
  product_name: string;
  product_image?: string;
  uk_price: number;
  source_marketplace: string;
  source_price_gbp: number;
  profit: number;
  roi: number;
  profit_margin: number;
  sales_per_month?: number;
  storefront_name?: string;
  added_from: 'recent_scans' | 'a2a_eu';
}

// POST - Add items to a sourcing list (bulk operation)
export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request);
    
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

    const body = await request.json();
    const { list_id, items, create_new_list } = body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required and cannot be empty' },
        { status: 400 }
      );
    }

    let targetListId = list_id;

    // If creating a new list, create it first
    if (create_new_list) {
      const { name, description } = create_new_list;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'List name is required when creating new list' },
          { status: 400 }
        );
      }

      const { data: newList, error: createError } = await supabase
        .from('sourcing_lists')
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description?.trim() || null
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating new sourcing list:', createError);
        return NextResponse.json(
          { error: 'Failed to create new sourcing list' },
          { status: 500 }
        );
      }

      targetListId = newList.id;
    }

    // Verify the user owns the target list
    if (targetListId) {
      const { data: listCheck, error: listError } = await supabase
        .from('sourcing_lists')
        .select('id')
        .eq('id', targetListId)
        .eq('user_id', user.id)
        .single();

      if (listError || !listCheck) {
        return NextResponse.json(
          { error: 'Sourcing list not found or access denied' },
          { status: 404 }
        );
      }
    }

    // Validate and prepare items for insertion
    const validatedItems: any[] = [];
    for (const item of items) {
      // Validate required fields
      if (!item.asin || !item.product_name || !item.source_marketplace || !item.added_from) {
        return NextResponse.json(
          { error: 'Each item must have asin, product_name, source_marketplace, and added_from' },
          { status: 400 }
        );
      }

      // Validate numeric fields
      if (typeof item.uk_price !== 'number' || typeof item.source_price_gbp !== 'number' || 
          typeof item.profit !== 'number' || typeof item.roi !== 'number') {
        return NextResponse.json(
          { error: 'Price, profit, and ROI must be numbers' },
          { status: 400 }
        );
      }

      validatedItems.push({
        sourcing_list_id: targetListId,
        asin: item.asin.trim().toUpperCase(),
        product_name: item.product_name.trim(),
        product_image: item.product_image?.trim() || null,
        uk_price: item.uk_price,
        source_marketplace: item.source_marketplace.trim().toUpperCase(),
        source_price_gbp: item.source_price_gbp,
        profit: item.profit,
        roi: item.roi,
        profit_margin: item.profit_margin || 0,
        sales_per_month: item.sales_per_month || null,
        storefront_name: item.storefront_name?.trim() || null,
        added_from: item.added_from
      });
    }

    // Insert items (using upsert to handle duplicates)
    const { data: insertedItems, error: insertError } = await supabase
      .from('sourcing_list_items')
      .upsert(validatedItems, { 
        onConflict: 'sourcing_list_id,asin,source_marketplace',
        ignoreDuplicates: false 
      })
      .select();

    if (insertError) {
      console.error('Error adding items to sourcing list:', insertError);
      return NextResponse.json(
        { error: 'Failed to add items to sourcing list' },
        { status: 500 }
      );
    }

    // Get updated list with totals
    const { data: updatedList, error: listError } = await supabase
      .from('sourcing_lists')
      .select('*')
      .eq('id', targetListId)
      .single();

    if (listError) {
      console.error('Error fetching updated list:', listError);
    }

    return NextResponse.json({ 
      success: true,
      added_count: insertedItems?.length || 0,
      list: updatedList,
      message: `Successfully added ${insertedItems?.length || 0} items to sourcing list`
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in POST /api/sourcing-lists/add-items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}