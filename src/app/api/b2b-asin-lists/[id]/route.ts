import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { ValidationError } from '@/lib/validation';
import { AppError } from '@/lib/error-handling';
import { checkEnvVars } from '@/lib/env-check';

interface Params {
  params: Promise<{ id: string }>;
}

// GET: Fetch a specific B2B ASIN list
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await validateApiRequest(request);
    const { id } = await params;
    
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

    const { data: list, error } = await supabase
      .from('b2b_asin_lists')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !list) {
      throw new AppError('List not found', 404, 'NOT_FOUND');
    }

    return NextResponse.json({ list });
    
  } catch (error: any) {
    console.error('Get B2B ASIN list error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
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

// PUT: Update a B2B ASIN list
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await validateApiRequest(request);
    const { id } = await params;
    const body = await request.json();
    
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

    // Build update object
    const updateData: any = {};
    
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.is_favorite !== undefined) updateData.is_favorite = body.is_favorite;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;
    
    if (body.asins !== undefined) {
      // Validate and clean ASINs
      const validASINs = body.asins
        .filter((asin: string) => /^[A-Z0-9]{10}$/i.test(asin))
        .map((asin: string) => asin.toUpperCase());
      updateData.asins = validASINs;
      updateData.asin_count = validASINs.length;
    }

    const { data: list, error } = await supabase
      .from('b2b_asin_lists')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !list) {
      throw new AppError('Failed to update list', 500, 'UPDATE_ERROR');
    }

    return NextResponse.json({ list });
    
  } catch (error: any) {
    console.error('Update B2B ASIN list error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
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

// DELETE: Delete a B2B ASIN list
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await validateApiRequest(request);
    const { id } = await params;
    
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

    const { error } = await supabase
      .from('b2b_asin_lists')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new AppError('Failed to delete list', 500, 'DELETE_ERROR');
    }

    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Delete B2B ASIN list error:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
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