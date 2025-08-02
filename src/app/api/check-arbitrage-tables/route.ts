import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Check if tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['arbitrage_scans', 'arbitrage_opportunities']);

    if (tablesError) {
      // Try a simpler approach - just try to select from the tables
      const checks = {
        arbitrage_scans: false,
        arbitrage_opportunities: false
      };

      // Check arbitrage_scans
      const { error: scansError } = await supabase
        .from('arbitrage_scans')
        .select('id')
        .limit(1);
      
      checks.arbitrage_scans = !scansError;

      // Check arbitrage_opportunities
      const { error: oppsError } = await supabase
        .from('arbitrage_opportunities')
        .select('id')
        .limit(1);
      
      checks.arbitrage_opportunities = !oppsError;

      return NextResponse.json({
        success: true,
        tablesExist: checks,
        method: 'direct_query',
        errors: {
          arbitrage_scans: scansError?.message,
          arbitrage_opportunities: oppsError?.message
        }
      });
    }

    const existingTables = tables?.map(t => t.table_name) || [];
    
    return NextResponse.json({
      success: true,
      tablesExist: {
        arbitrage_scans: existingTables.includes('arbitrage_scans'),
        arbitrage_opportunities: existingTables.includes('arbitrage_opportunities')
      },
      method: 'information_schema',
      foundTables: existingTables
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}