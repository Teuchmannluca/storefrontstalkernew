import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// Validate ASIN format
const validateASIN = (asin: string): boolean => {
  const asinRegex = /^[A-Z0-9]{10}$/i;
  return asinRegex.test(asin);
};

// GET - List all user's ASIN lists
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

    // Fetch all lists for the user
    const { data: lists, error } = await supabase
      .from('asin_lists')
      .select('*')
      .eq('user_id', user.id)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching ASIN lists:', error);
      return NextResponse.json(
        { error: 'Failed to fetch ASIN lists' },
        { status: 500 }
      );
    }

    return NextResponse.json({ lists });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in GET /api/asin-lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new ASIN list
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
    const { name, description, asins, is_favorite = false } = body;

    // Validate input
    if (!name || !asins || !Array.isArray(asins)) {
      return NextResponse.json(
        { error: 'Name and ASINs are required' },
        { status: 400 }
      );
    }

    if (asins.length === 0) {
      return NextResponse.json(
        { error: 'At least one ASIN is required' },
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
    const uniqueAsins = [...new Set(cleanedAsins)];

    // Create the list
    const { data: newList, error } = await supabase
      .from('asin_lists')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        asins: uniqueAsins,
        is_favorite
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating ASIN list:', error);
      return NextResponse.json(
        { error: 'Failed to create ASIN list' },
        { status: 500 }
      );
    }

    return NextResponse.json({ list: newList }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in POST /api/asin-lists:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}