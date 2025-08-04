import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// GET - List all user's sourcing lists
export async function GET(request: NextRequest) {
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

    // Fetch all sourcing lists for the user
    const { data: lists, error } = await supabase
      .from('sourcing_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('is_favorite', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching sourcing lists:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sourcing lists' },
        { status: 500 }
      );
    }

    return NextResponse.json({ lists });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in GET /api/sourcing-lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new sourcing list
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
    const { name, description, is_favorite = false } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (name.length > 255) {
      return NextResponse.json(
        { error: 'Name must be 255 characters or less' },
        { status: 400 }
      );
    }

    // Create the sourcing list
    const { data: newList, error } = await supabase
      .from('sourcing_lists')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        is_favorite
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating sourcing list:', error);
      return NextResponse.json(
        { error: 'Failed to create sourcing list' },
        { status: 500 }
      );
    }

    return NextResponse.json({ list: newList }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in POST /api/sourcing-lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}