import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import SPAPIClient from '@/lib/sp-api'
import KeepaAPI from '@/lib/keepa-api'
import https from 'https'
import { requireAuth, unauthorizedResponse, serverErrorResponse } from '@/lib/auth-helpers'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user } = await requireAuth()
    
    const { asin, storefrontId } = await request.json()
    
    if (!asin) {
      return NextResponse.json(
        { error: 'ASIN is required' },
        { status: 400 }
      )
    }

    // Initialize SP-API client with correct environment variables
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    }
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
    }

    // Check if we have all required config
    if (!credentials.accessKeyId || !credentials.secretAccessKey || !config.clientId || !config.refreshToken) {
      console.log('Missing SP-API configuration')
      return NextResponse.json(
        { error: 'Amazon SP-API not configured' },
        { status: 500 }
      )
    }

    const spApi = new SPAPIClient(credentials, config)
    
    console.log(`Fetching details from Amazon for ASIN: ${asin}`)
    
    let productDetails;
    try {
      // Try SP-API first
      productDetails = await spApi.getProductByASIN(asin);
    } catch (spApiError: any) {
      console.log('SP-API failed, trying Keepa API...');
      
      // Fallback to Keepa API
      if (process.env.KEEPA_API_KEY) {
        const keepaApi = new KeepaAPI(
          process.env.KEEPA_API_KEY,
          parseInt(process.env.KEEPA_DOMAIN || '2')
        );
        
        try {
          const keepaResult = await keepaApi.getProductByASIN(asin);
          if (keepaResult) {
            productDetails = {
              asin: keepaResult.asin,
              title: keepaResult.title,
              brand: keepaResult.brand,
              mainImage: keepaResult.mainImage,
              salesRanks: keepaResult.salesRank ? [{
                rank: keepaResult.salesRank,
                category: keepaResult.salesRankCategory || 'Unknown'
              }] : []
            };
          } else {
            throw new Error('Product not found');
          }
        } catch (keepaError) {
          console.error('Keepa API also failed:', keepaError);
          throw spApiError; // Throw original SP-API error
        }
      } else {
        throw spApiError;
      }
    }
    
    // Map to database format
    const productData = {
      asin: productDetails.asin,
      product_name: productDetails.title,
      brand: productDetails.brand,
      image_link: productDetails.mainImage,
      current_sales_rank: productDetails.salesRanks[0]?.rank || null,
      sales_rank_category: productDetails.salesRanks[0]?.category || null,
      last_checked: new Date().toISOString()
    }

    // Update the product in database if storefrontId is provided
    if (storefrontId) {
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('asin', asin)
        .eq('storefront_id', storefrontId)
      
      if (updateError) {
        console.error('Error updating product:', updateError)
      }
    }

    return NextResponse.json({
      success: true,
      data: productData
    })

  } catch (error: any) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return unauthorizedResponse()
    }
    console.error('Error fetching Amazon details:', error)
    return serverErrorResponse('Failed to fetch product details')
  }
}

// Batch endpoint for multiple ASINs
export async function PUT(request: NextRequest) {
  try {
    // Verify authentication
    const { user } = await requireAuth()
    
    const { asins, storefrontId } = await request.json()
    
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: 'ASINs array is required' },
        { status: 400 }
      )
    }

    // Limit to 20 ASINs per request (SP-API limit)
    const limitedAsins = asins.slice(0, 20)

    // Initialize SP-API client
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: undefined,
      region: process.env.AWS_REGION || 'eu-west-1',
    }
    
    const config = {
      clientId: process.env.AMAZON_ACCESS_KEY_ID!,
      clientSecret: process.env.AMAZON_SECRET_ACCESS_KEY!,
      refreshToken: process.env.AMAZON_REFRESH_TOKEN!,
      marketplaceId: process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P',
    }

    if (!credentials.accessKeyId || !credentials.secretAccessKey || !config.clientId || !config.refreshToken) {
      return NextResponse.json(
        { error: 'Amazon SP-API not configured' },
        { status: 500 }
      )
    }

    const spApi = new SPAPIClient(credentials, config)
    
    console.log(`Fetching details for ${limitedAsins.length} ASINs from Amazon`)
    
    const results = []
    let updatedCount = 0

    // Process ASINs one by one (SP-API doesn't support batch for catalog items)
    for (const asin of limitedAsins) {
      try {
        let productDetails;
        try {
          // Try SP-API first
          productDetails = await spApi.getProductByASIN(asin);
        } catch (spApiError: any) {
          // Fallback to Keepa API if available
          if (process.env.KEEPA_API_KEY) {
            const keepaApi = new KeepaAPI(
              process.env.KEEPA_API_KEY,
              parseInt(process.env.KEEPA_DOMAIN || '2')
            );
            
            try {
              const keepaResult = await keepaApi.getProductByASIN(asin);
              if (keepaResult) {
                productDetails = {
                  asin: keepaResult.asin,
                  title: keepaResult.title,
                  brand: keepaResult.brand,
                  mainImage: keepaResult.mainImage,
                  salesRanks: keepaResult.salesRank ? [{
                    rank: keepaResult.salesRank,
                    category: keepaResult.salesRankCategory || 'Unknown'
                  }] : []
                };
              } else {
                throw new Error('Product not found');
              }
            } catch (keepaError) {
              throw spApiError; // Throw original error
            }
          } else {
            throw spApiError;
          }
        }
        
        const productData = {
          asin: productDetails.asin,
          product_name: productDetails.title,
          brand: productDetails.brand,
          image_link: productDetails.mainImage,
          current_sales_rank: productDetails.salesRanks[0]?.rank || null,
          sales_rank_category: productDetails.salesRanks[0]?.category || null,
          last_checked: new Date().toISOString()
        }

        results.push(productData)

        // Update in database if storefrontId provided
        if (storefrontId) {
          const { error } = await supabase
            .from('products')
            .update(productData)
            .eq('asin', asin)
            .eq('storefront_id', storefrontId)
          
          if (!error) {
            updatedCount++
          }
        }
      } catch (itemError) {
        console.error(`Error fetching ASIN ${asin}:`, itemError)
        // Continue with next ASIN
      }
    }

    return NextResponse.json({
      success: true,
      requested: limitedAsins.length,
      found: results.length,
      updated: updatedCount,
      data: results
    })

  } catch (error: any) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return unauthorizedResponse()
    }
    console.error('Error fetching Amazon details:', error)
    return serverErrorResponse('Failed to fetch product details')
  }
}