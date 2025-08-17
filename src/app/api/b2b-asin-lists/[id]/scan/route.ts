import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { AppError } from '@/lib/error-handling';
import { checkEnvVars } from '@/lib/env-check';

interface Params {
  params: Promise<{ id: string }>;
}

// POST: Update scan statistics for a B2B ASIN list
export async function POST(request: NextRequest, { params }: Params) {
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

    // First get current scan count
    const { data: currentList } = await supabase
      .from('b2b_asin_lists')
      .select('scan_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    // Update scan statistics
    const { data: list, error } = await supabase
      .from('b2b_asin_lists')
      .update({
        last_scanned_at: new Date().toISOString(),
        scan_count: (currentList?.scan_count || 0) + 1
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !list) {
      throw new AppError('Failed to update scan statistics', 500, 'UPDATE_ERROR');
    }

    return NextResponse.json({ list });
    
  } catch (error: any) {
    console.error('Update B2B scan stats error:', error);
    
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