import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// POST - Update scan statistics and return ASINs for scanning
export async function POST(
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

    // Fetch the list and update scan stats
    const { data: list, error: fetchError } = await supabase
      .from('asin_lists')
      .select('*')
      .eq('id', listId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !list) {
      return NextResponse.json(
        { error: 'List not found' },
        { status: 404 }
      );
    }

    // Update scan statistics
    const { error: updateError } = await supabase
      .from('asin_lists')
      .update({
        last_scanned_at: new Date().toISOString(),
        scan_count: (list.scan_count || 0) + 1
      })
      .eq('id', listId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating scan stats:', updateError);
      // Continue even if update fails
    }

    // Return the list with ASINs ready for scanning
    return NextResponse.json({ 
      list: {
        ...list,
        last_scanned_at: new Date().toISOString(),
        scan_count: (list.scan_count || 0) + 1
      }
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.error('Error in POST /api/asin-lists/[id]/scan:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}