import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    const { scanId } = await params;

    if (!scanId) {
      return NextResponse.json(
        { error: 'Scan ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role for deletion
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First, verify the scan belongs to the authenticated user
    const { data: scan, error: scanError } = await supabase
      .from('arbitrage_scans')
      .select('id, user_id')
      .eq('id', scanId)
      .single();

    if (scanError) {
      if (scanError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Scan not found' },
          { status: 404 }
        );
      }
      throw scanError;
    }

    // Check ownership
    if (scan.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized - scan belongs to different user' },
        { status: 403 }
      );
    }

    // Delete arbitrage opportunities first (foreign key constraint)
    const { error: opportunitiesError } = await supabase
      .from('arbitrage_opportunities')
      .delete()
      .eq('scan_id', scanId);

    if (opportunitiesError) {
      console.error('Error deleting opportunities:', opportunitiesError);
      return NextResponse.json(
        { error: 'Failed to delete scan opportunities' },
        { status: 500 }
      );
    }

    // Then delete the scan itself
    const { error: scanDeleteError } = await supabase
      .from('arbitrage_scans')
      .delete()
      .eq('id', scanId);

    if (scanDeleteError) {
      console.error('Error deleting scan:', scanDeleteError);
      return NextResponse.json(
        { error: 'Failed to delete scan' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Scan and associated opportunities deleted successfully',
      deletedScanId: scanId
    });

  } catch (error) {
    console.error('Error in scan deletion:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    const { scanId } = await params;

    if (!scanId) {
      return NextResponse.json(
        { error: 'Scan ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get scan details
    const { data: scan, error: scanError } = await supabase
      .from('arbitrage_scans')
      .select('*')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .single();

    if (scanError) {
      if (scanError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Scan not found' },
          { status: 404 }
        );
      }
      throw scanError;
    }

    // Get associated opportunities count
    const { count: opportunitiesCount, error: countError } = await supabase
      .from('arbitrage_opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('scan_id', scanId);

    if (countError) {
      console.error('Error counting opportunities:', countError);
    }

    return NextResponse.json({
      success: true,
      scan: scan,
      opportunitiesCount: opportunitiesCount || 0
    });

  } catch (error) {
    console.error('Error fetching scan details:', error);
    
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}