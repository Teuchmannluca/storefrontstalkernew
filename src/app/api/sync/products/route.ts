import { NextRequest, NextResponse } from 'next/server';
import { ProductSyncService } from '@/lib/product-sync';

export async function POST(request: NextRequest) {
  try {
    // Verify authorization - you can use a secret token or check for admin role
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.SYNC_SECRET_TOKEN; // Add this to your env
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Initialize sync service
    const syncService = new ProductSyncService();
    
    // Check if specific ASIN is provided
    const body = await request.json().catch(() => ({}));
    
    if (body.asin) {
      // Sync specific product
      await syncService.syncProductByASIN(body.asin);
      return NextResponse.json({ 
        success: true, 
        message: `Product ${body.asin} synced successfully` 
      });
    } else {
      // Sync all products
      const result = await syncService.syncAllProducts();
      return NextResponse.json(result);
    }
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.SYNC_SECRET_TOKEN;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // You can add logic here to return sync statistics
    return NextResponse.json({ 
      status: 'ready',
      message: 'Product sync endpoint is operational' 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}