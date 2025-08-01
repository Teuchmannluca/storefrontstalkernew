import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KeepaClient } from '@/lib/keepa'

export async function POST(request: NextRequest) {
  const debugInfo: any = {
    timestamp: new Date().toISOString(),
    steps: [],
    errors: [],
    data: {}
  }

  try {
    // Step 1: Check environment variables
    debugInfo.steps.push('Checking environment variables')
    const envCheck = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasSupabaseService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasKeepaKey: !!process.env.KEEPA_API_KEY,
      keepaKeyLength: process.env.KEEPA_API_KEY?.length || 0
    }
    debugInfo.data.envCheck = envCheck

    if (!envCheck.hasKeepaKey) {
      throw new Error('KEEPA_API_KEY is missing')
    }

    // Step 2: Parse request body
    debugInfo.steps.push('Parsing request body')
    const { storefrontId, sellerId } = await request.json()
    debugInfo.data.request = { storefrontId, sellerId }

    if (!storefrontId || !sellerId) {
      throw new Error('Missing storefrontId or sellerId')
    }

    // Step 3: Initialize Supabase
    debugInfo.steps.push('Initializing Supabase client')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Step 4: Verify storefront exists
    debugInfo.steps.push('Verifying storefront exists')
    const { data: storefront, error: storefrontError } = await supabase
      .from('storefronts')
      .select('*')
      .eq('id', storefrontId)
      .single()

    if (storefrontError) {
      debugInfo.errors.push({ step: 'storefront_check', error: storefrontError })
      throw new Error(`Storefront error: ${storefrontError.message}`)
    }
    debugInfo.data.storefront = storefront

    // Step 5: Test Keepa API
    debugInfo.steps.push('Testing Keepa API')
    const keepa = new KeepaClient(process.env.KEEPA_API_KEY!)
    
    try {
      const keepaResponse = await keepa.getSellerProducts(sellerId)
      debugInfo.data.keepaResponse = {
        hasData: !!keepaResponse,
        seller: keepaResponse?.seller,
        asinCount: keepaResponse?.asinList?.length || 0,
        asins: keepaResponse?.asinList?.slice(0, 5) // First 5 ASINs for debug
      }
    } catch (keepaError: any) {
      debugInfo.errors.push({ 
        step: 'keepa_api', 
        error: keepaError.message,
        status: keepaError.status
      })
      throw new Error(`Keepa API error: ${keepaError.message}`)
    }

    // Step 6: Check existing products
    debugInfo.steps.push('Checking existing products')
    const { data: existingProducts, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('storefront_id', storefrontId)
      .limit(5)

    debugInfo.data.existingProducts = {
      count: existingProducts?.length || 0,
      sample: existingProducts?.slice(0, 2)
    }

    // Step 7: Test product insertion
    debugInfo.steps.push('Testing product insertion')
    const testProduct = {
      storefront_id: storefrontId,
      asin: 'TEST-' + Date.now(),
      seller_id: sellerId,
      product_name: 'Debug Test Product',
      price: 99.99,
      current_sales_rank: 1000,
      brand: 'Test Brand',
      image_link: null,
      last_checked: new Date().toISOString()
    }

    const { data: insertTest, error: insertError } = await supabase
      .from('products')
      .insert([testProduct])
      .select()

    if (insertError) {
      debugInfo.errors.push({ step: 'insert_test', error: insertError })
    } else {
      debugInfo.data.insertTest = { success: true, data: insertTest }
      
      // Clean up test product
      await supabase
        .from('products')
        .delete()
        .eq('asin', testProduct.asin)
    }

    debugInfo.success = true
    debugInfo.message = 'Debug completed successfully'

  } catch (error: any) {
    debugInfo.success = false
    debugInfo.message = error.message
    debugInfo.errors.push({ step: 'general', error: error.message })
  }

  return NextResponse.json(debugInfo, { 
    status: debugInfo.success ? 200 : 500,
    headers: {
      'Content-Type': 'application/json',
    }
  })
}