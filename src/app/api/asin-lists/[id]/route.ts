import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// Validate ASIN format
const validateASIN = (asin: string): boolean => {
  const asinRegex = /^[A-Z0-9]{10}$/i;
  return asinRegex.test(asin);
};

// GET - Get specific ASIN list
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await validateApiRequest(request);
    const { id: listId } = await params;
    
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

    // Fetch the list
    const { data: list, error } = await supabase
      .from('asin_lists')
      .select('*')
      .eq('id', listId)
      .eq('user_id', user.id)
      .single();

    if (error || !list) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ list });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in GET /api/asin-lists/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update ASIN list
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await validateApiRequest(request);
    const { id: listId } = await params;
    
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
    const { name, description, asins, is_favorite } = body;

    // Build update object
    const updateData: any = {};
    
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    
    if (is_favorite !== undefined) {
      updateData.is_favorite = is_favorite;
    }
    
    if (asins !== undefined) {
      if (!Array.isArray(asins) || asins.length === 0) {
        return NextResponse.json(
          { error: 'ASINs must be a non-empty array' },
          { status: 400 }
        );
      }
      
      // Validate and clean ASINs
      const cleanedAsins = asins
        .map(asin => asin.trim().toUpperCase())
        .filter(asin => validateASIN(asin));

      if (cleanedAsins.length === 0) {
        return NextResponse.json(
          { error: 'No valid ASINs provided' },
          { status: 400 }
        );
      }

      // Remove duplicates
      updateData.asins = [...new Set(cleanedAsins)];
    }

    // Update the list
    const { data: updatedList, error } = await supabase
      .from('asin_lists')
      .update(updateData)
      .eq('id', listId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !updatedList) {
      return NextResponse.json(
        { error: 'Failed to update list or list not found' },
        { status: error ? 500 : 404 }
      );
    }

    return NextResponse.json({ list: updatedList });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in PUT /api/asin-lists/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete ASIN list
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await validateApiRequest(request);
    const { id: listId } = await params;
    
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

    // Delete the list
    const { error } = await supabase
      .from('asin_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting ASIN list:', error);
      return NextResponse.json(
        { error: 'Failed to delete list' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in DELETE /api/asin-lists/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}