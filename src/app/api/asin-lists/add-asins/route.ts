import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateApiRequest, AuthError } from '@/lib/auth'
import { checkEnvVars } from '@/lib/env-check'

// Validate ASIN format
const validateASIN = (asin: string): boolean => {
  const asinRegex = /^[A-Z0-9]{10}$/i;
  return asinRegex.test(asin);
};

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request)
    const userId = user.id
    
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    })

    if (!envCheck.success) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    )
    
    const body = await request.json()
    const { listIds, asins } = body

    console.log('Add ASINs request:', { listIds, asinCount: asins.length, userId })

    // Validate input
    if (!Array.isArray(listIds) || listIds.length === 0) {
      return NextResponse.json(
        { error: 'List IDs array is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: 'ASINs array is required' },
        { status: 400 }
      )
    }

    // Validate and clean ASINs format
    const validAsins = asins
      .map(asin => typeof asin === 'string' ? asin.trim().toUpperCase() : '')
      .filter(asin => {
        const isValid = asin.length > 0 && validateASIN(asin)
        if (!isValid && asin) {
          console.log('Invalid ASIN format:', asin)
        }
        return isValid
      })

    // Remove duplicates
    const uniqueAsins = [...new Set(validAsins)]
    
    console.log('Valid unique ASINs:', uniqueAsins)

    if (uniqueAsins.length === 0) {
      return NextResponse.json(
        { error: 'No valid ASINs provided' },
        { status: 400 }
      )
    }

    const results = []

    // Process each list
    for (const listId of listIds) {
      try {
        console.log(`Processing list ${listId} for user ${userId}`)
        
        // Verify the list belongs to the user
        const { data: listData, error: listError } = await supabase
          .from('asin_lists')
          .select('id, asins')
          .eq('id', listId)
          .eq('user_id', userId)
          .single()

        console.log('List query result:', { listData, listError })

        if (listError || !listData) {
          console.log(`List ${listId} not found or error:`, listError)
          results.push({
            listId,
            success: false,
            error: 'List not found or access denied',
            addedCount: 0
          })
          continue
        }

        // Get current ASINs in the list
        const currentAsins = listData.asins || []
        const currentAsinSet = new Set(currentAsins)

        // Filter out duplicates
        const newAsins = uniqueAsins.filter(asin => !currentAsinSet.has(asin))
        
        if (newAsins.length === 0) {
          results.push({
            listId,
            success: true,
            message: 'All ASINs already in list',
            addedCount: 0
          })
          continue
        }

        // Combine current and new ASINs
        const updatedAsins = [...currentAsins, ...newAsins]

        // Update the list
        console.log(`Updating list ${listId} with ${newAsins.length} new ASINs`)
        console.log('Updated ASINs array length:', updatedAsins.length)
        
        const { error: updateError } = await supabase
          .from('asin_lists')
          .update({ 
            asins: updatedAsins,
            updated_at: new Date().toISOString()
          })
          .eq('id', listId)
          .eq('user_id', userId)

        console.log('Update result:', { updateError })

        if (updateError) {
          console.error('Error updating list:', updateError)
          results.push({
            listId,
            success: false,
            error: 'Failed to update list',
            addedCount: 0
          })
        } else {
          console.log(`Successfully updated list ${listId}`)
          results.push({
            listId,
            success: true,
            addedCount: newAsins.length
          })
        }

      } catch (error) {
        console.error(`Error processing list ${listId}:`, error)
        results.push({
          listId,
          success: false,
          error: 'Internal server error',
          addedCount: 0
        })
      }
    }

    // Check if any updates were successful
    const hasSuccess = results.some(result => result.success)
    const totalAdded = results.reduce((sum, result) => sum + result.addedCount, 0)

    if (!hasSuccess) {
      return NextResponse.json(
        { 
          error: 'Failed to add ASINs to any lists', 
          results 
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully added ${totalAdded} ASINs to ${results.filter(r => r.success).length} list(s)`,
      results,
      totalAdded
    })

  } catch (error) {
    console.error('Error in add-asins API:', error)
    
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}