import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KeepaClient } from '@/lib/keepa'
import { checkEnvVars } from '@/lib/env-check'

export async function POST(request: NextRequest) {
  console.log('Sync-products API called')
  
  try {
    // Check required environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      keepa: { apiKey: true }
    });

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Initialize Supabase client with service role for API routes
    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );
    const body = await request.json()
    console.log('Request body:', body)
    const { storefrontId, sellerId } = body
    
    if (!storefrontId || !sellerId) {
      return NextResponse.json(
        { error: 'Missing storefrontId or sellerId' },
        { status: 400 }
      )
    }

    // Verify the storefront belongs to the authenticated user
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify storefront ownership
    const { data: storefront, error: storefrontError } = await supabase
      .from('storefronts')
      .select('*')
      .eq('id', storefrontId)
      .eq('user_id', user.id)
      .single()

    if (storefrontError || !storefront) {
      return NextResponse.json({ error: 'Storefront not found' }, { status: 404 })
    }

    // Initialize Keepa client
    const keepaApiKey = envCheck.values.keepaApiKey
    console.log('Keepa API key exists:', !!keepaApiKey)
    
    if (!keepaApiKey) {
      return NextResponse.json(
        { error: 'Keepa API key not configured' },
        { status: 500 }
      )
    }

    const keepa = new KeepaClient(keepaApiKey)

    // Fetch seller products from Keepa
    console.log(`Calling Keepa API for seller: ${sellerId}`)
    const sellerData = await keepa.getSellerProducts(sellerId)
    console.log('Full Keepa response:', JSON.stringify(sellerData, null, 2))
    console.log('Keepa response summary:', { 
      hasData: !!sellerData, 
      asinCount: sellerData?.asinList?.length || 0,
      totalStorefrontAsins: (sellerData as any)?.totalStorefrontAsins,
      seller: sellerData?.seller
    })
    
    // Extract the seller data from the response
    let sellerInfo = null
    let asinList = []
    
    // The response has sellers object with sellerId as key
    if ((sellerData as any).sellers && (sellerData as any).sellers[sellerId]) {
      sellerInfo = (sellerData as any).sellers[sellerId]
      asinList = sellerInfo.asinList || []
      console.log(`Found seller info with ${asinList.length} ASINs`)
    } else {
      console.log('Seller not found in response structure')
    }
    
    if (asinList.length === 0) {
      return NextResponse.json({
        message: 'No products found for this seller',
        count: 0
      })
    }

    console.log(`Found ${asinList.length} ASINs for seller ${sellerId}`)

    // For now, let's insert basic product records with just ASINs
    // We'll fetch detailed info in batches later
    const productsToInsert = asinList.map((asin: string) => ({
      storefront_id: storefrontId,
      asin: asin,
      seller_id: sellerId,
      product_name: `Product ${asin}`, // Placeholder, will update later
      brand: null,
      image_link: null,
      price: null,
      current_sales_rank: null,
      last_checked: new Date().toISOString()
    }))

    console.log(`Preparing to insert ${productsToInsert.length} products`)

    // Upsert products (insert or update if exists)
    const { data: insertedProducts, error: insertError } = await supabase
      .from('products')
      .upsert(
        productsToInsert,
        { 
          onConflict: 'asin,storefront_id'
        }
      )
      .select()

    if (insertError) {
      console.error('Error inserting products:', insertError)
      return NextResponse.json(
        { 
          error: 'Failed to save products',
          details: insertError.message,
          code: insertError.code
        },
        { status: 500 }
      )
    }

    console.log(`Successfully inserted ${insertedProducts?.length || 0} products`)

    // Now let's fetch detailed info for the first batch of products
    const batchSize = 10 // Start with a small batch
    const firstBatchAsins = asinList.slice(0, batchSize)
    
    try {
      console.log(`Fetching details for ${firstBatchAsins.length} products`)
      const detailedProducts = await keepa.getProductDetails(firstBatchAsins)
      
      // Update the products with detailed information
      for (const product of detailedProducts) {
        if (product.asin && product.title) {
          await supabase
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
        }
      }
    } catch (detailError) {
      console.error('Error fetching product details:', detailError)
      // Continue even if detail fetching fails
    }

    return NextResponse.json({
      message: 'Products synced successfully',
      count: insertedProducts?.length || 0,
      asinCount: asinList.length,
      firstAsins: asinList.slice(0, 5),
      sellerName: sellerInfo?.sellerName || 'Unknown',
      totalStorefrontAsins: sellerInfo?.totalStorefrontAsins?.[1] || asinList.length
    })

  } catch (error: any) {
    console.error('Error in sync-products API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}