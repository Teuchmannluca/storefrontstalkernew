import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { ValidationError } from '@/lib/validation';
import { AppError } from '@/lib/error-handling';
import { checkEnvVars } from '@/lib/env-check';

// GET: Fetch all B2B ASIN lists for the user
export async function GET(request: NextRequest) {
  try {
    const user = await validateApiRequest(request);
    
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

    const { data: lists, error } = await supabase
      .from('b2b_asin_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching B2B ASIN lists:', error);
      throw new AppError('Failed to fetch lists', 500, 'DATABASE_ERROR');
    }

    return NextResponse.json({ lists: lists || [] });
    
  } catch (error: any) {
    console.error('B2B ASIN lists error:', error);
    
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

// POST: Create a new B2B ASIN list
export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request);
    
    const body = await request.json();
    
    if (!body.name || !body.asins || !Array.isArray(body.asins)) {
      throw new ValidationError('Name and ASINs are required', 'name');
    }

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

    // Validate and clean ASINs
    const validASINs = body.asins
      .filter((asin: string) => /^[A-Z0-9]{10}$/i.test(asin))
      .map((asin: string) => asin.toUpperCase());

    const { data: list, error } = await supabase
      .from('b2b_asin_lists')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        asins: validASINs,
        asin_count: validASINs.length,
        is_favorite: body.is_favorite || false,
        metadata: body.metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating B2B ASIN list:', error);
      throw new AppError('Failed to create list', 500, 'DATABASE_ERROR');
    }

    return NextResponse.json({ list });
    
  } catch (error: any) {
    console.error('Create B2B ASIN list error:', error);
    
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