import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

interface BlacklistItem {
  id: string;
  asin: string;
  reason: string | null;
  created_at: string;
}

interface AddBlacklistRequest {
  asin: string;
  reason?: string;
}

// GET - Fetch all blacklisted ASINs for the user
export async function GET(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Fetch blacklisted ASINs for the user
    const { data: blacklist, error } = await supabase
      .from('asin_blacklist')
      .select('id, asin, reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blacklist:', error);
      return NextResponse.json(
        { error: 'Failed to fetch blacklist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ blacklist: blacklist || [] });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    console.error('Blacklist GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add ASIN to blacklist
export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Parse request body
    const body: AddBlacklistRequest = await request.json();
    
    // Validate ASIN format (Amazon ASINs are 10 characters)
    if (!body.asin || typeof body.asin !== 'string' || body.asin.length !== 10) {
      return NextResponse.json(
        { error: 'Invalid ASIN format. ASIN must be exactly 10 characters.' },
        { status: 400 }
      );
    }

    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Add ASIN to blacklist
    const { data, error } = await supabase
      .from('asin_blacklist')
      .insert({
        user_id: user.id,
        asin: body.asin.toUpperCase(), // Normalize to uppercase
        reason: body.reason || null
      })
      .select('id, asin, reason, created_at')
      .single();

    if (error) {
      // Handle duplicate ASIN error
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'ASIN is already blacklisted' },
          { status: 409 }
        );
      }

      console.error('Error adding to blacklist:', error);
      return NextResponse.json(
        { error: 'Failed to add ASIN to blacklist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'ASIN added to blacklist successfully',
      blacklistItem: data
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    console.error('Blacklist POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove ASIN from blacklist
export async function DELETE(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Get ASIN from query parameters
    const { searchParams } = new URL(request.url);
    const asin = searchParams.get('asin');
    
    if (!asin || asin.length !== 10) {
      return NextResponse.json(
        { error: 'Invalid ASIN format. ASIN must be exactly 10 characters.' },
        { status: 400 }
      );
    }

    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Remove ASIN from blacklist
    const { error } = await supabase
      .from('asin_blacklist')
      .delete()
      .eq('user_id', user.id)
      .eq('asin', asin.toUpperCase());

    if (error) {
      console.error('Error removing from blacklist:', error);
      return NextResponse.json(
        { error: 'Failed to remove ASIN from blacklist' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: 'ASIN removed from blacklist successfully'
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    console.error('Blacklist DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}