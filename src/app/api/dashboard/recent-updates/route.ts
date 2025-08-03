import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'

interface StorefrontUpdate {
  storefront_id: string
  storefront_name: string
  seller_id: string
  products_added_24h: number
  products_removed_24h: number
  total_products: number
  last_sync_completed_at: string | null
  last_sync_status: string
  recent_products: {
    asin: string
    product_name: string | null
    added_at: string
  }[]
}

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await requireAuth()
    
    if (!user) {
      return unauthorizedResponse()
    }

    // Get the timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    // First, get all storefronts with their update stats
    const { data: storefronts, error: storefrontsError } = await supabase
      .from('storefronts')
      .select(`
        id,
        name,
        seller_id,
        last_sync_completed_at,
        last_sync_status,
        total_products_synced
      `)
      .eq('user_id', user.id)
      .order('last_sync_completed_at', { ascending: false, nullsFirst: false })

    if (storefrontsError) {
      console.error('Error fetching storefronts:', storefrontsError)
      throw storefrontsError
    }

    if (!storefronts || storefronts.length === 0) {
      return NextResponse.json({ updates: [] })
    }

    // Now get update statistics for each storefront
    const updates: StorefrontUpdate[] = []

    for (const storefront of storefronts) {
      // Get products added in the last 24 hours
      const { data: recentProducts, count: addedCount } = await supabase
        .from('products')
        .select('asin, product_name, created_at', { count: 'exact' })
        .eq('storefront_id', storefront.id)
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5) // Get top 5 most recent for preview

      // Get products removed in the last 24 hours (if you track this)
      // For now, we'll check update queue for removed products count
      const { data: updateQueueData } = await supabase
        .from('storefront_update_queue')
        .select('products_removed, completed_at')
        .eq('storefront_id', storefront.id)
        .eq('status', 'completed')
        .gte('completed_at', twentyFourHoursAgo.toISOString())
        .order('completed_at', { ascending: false })
        .limit(1)

      const removedCount = updateQueueData?.[0]?.products_removed || 0

      // Get total product count for this storefront
      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('storefront_id', storefront.id)

      // Only include storefronts with recent activity
      if ((addedCount || 0) > 0 || removedCount > 0 || 
          (storefront.last_sync_completed_at && 
           new Date(storefront.last_sync_completed_at) > twentyFourHoursAgo)) {
        
        updates.push({
          storefront_id: storefront.id,
          storefront_name: storefront.name,
          seller_id: storefront.seller_id,
          products_added_24h: addedCount || 0,
          products_removed_24h: removedCount,
          total_products: totalProducts || 0,
          last_sync_completed_at: storefront.last_sync_completed_at,
          last_sync_status: storefront.last_sync_status || 'never',
          recent_products: recentProducts?.map(p => ({
            asin: p.asin,
            product_name: p.product_name,
            added_at: p.created_at
          })) || []
        })
      }
    }

    // Sort by most recent activity
    updates.sort((a, b) => {
      const dateA = a.last_sync_completed_at ? new Date(a.last_sync_completed_at).getTime() : 0
      const dateB = b.last_sync_completed_at ? new Date(b.last_sync_completed_at).getTime() : 0
      return dateB - dateA
    })

    // Get summary statistics
    const totalNewProducts = updates.reduce((sum, u) => sum + u.products_added_24h, 0)
    const totalRemovedProducts = updates.reduce((sum, u) => sum + u.products_removed_24h, 0)
    const activeStorefronts = updates.length

    return NextResponse.json({
      summary: {
        activeStorefronts,
        totalNewProducts,
        totalRemovedProducts,
        lastUpdated: new Date().toISOString()
      },
      updates
    })

  } catch (error) {
    console.error('Error fetching recent updates:', error)
    return serverErrorResponse('Failed to fetch recent updates')
  }
}