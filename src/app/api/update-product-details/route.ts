import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KeepaClient } from '@/lib/keepa'

export async function POST(request: NextRequest) {
  try {
    const { storefrontId, limit = 20 } = await request.json()
    
    // Initialize Supabase with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Find products that need details (products with generic names)
    const { data: productsNeedingDetails, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('storefront_id', storefrontId)
      .like('product_name', 'Product %')
      .limit(limit)

    if (fetchError || !productsNeedingDetails || productsNeedingDetails.length === 0) {
      return NextResponse.json({
        message: 'No products need updating',
        count: 0
      })
    }

    const keepa = new KeepaClient(process.env.KEEPA_API_KEY!)
    const asins = productsNeedingDetails.map(p => p.asin)
    
    console.log(`Fetching details for ${asins.length} products`)
    
    // Fetch detailed product information from Keepa
    const detailedProducts = await keepa.getProductDetails(asins)
    
    let updatedCount = 0
    
    // Update each product with detailed information
    for (const product of detailedProducts) {
      if (product.asin && product.title) {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            product_name: product.title,
            brand: product.brand || null,
            image_link: KeepaClient.extractMainImage(product.imagesCSV),
            price: KeepaClient.getCurrentPrice(product.stats),
            current_sales_rank: KeepaClient.getCurrentSalesRank(product),
            last_checked: new Date().toISOString()
          })
          .eq('asin', product.asin)
          .eq('storefront_id', storefrontId)
          
        if (!updateError) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      message: 'Product details updated',
      requested: asins.length,
      updated: updatedCount
    })

  } catch (error: any) {
    console.error('Error updating product details:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update product details' },
      { status: 500 }
    )
  }
}