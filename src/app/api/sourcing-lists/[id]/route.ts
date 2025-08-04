import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateApiRequest, AuthError } from '@/lib/auth'
import { checkEnvVars } from '@/lib/env-check'

// GET - Get single sourcing list
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await validateApiRequest(request)
    
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

    const { data: list, error } = await supabase
      .from('sourcing_lists')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error fetching sourcing list:', error)
      return NextResponse.json(
        { error: 'Sourcing list not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ list })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    console.error('Error in GET /api/sourcing-lists/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update sourcing list
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await validateApiRequest(request)
    
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
    const { name, description, is_favorite } = body

    // Build update object dynamically
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Name is required' },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    if (is_favorite !== undefined) {
      updateData.is_favorite = Boolean(is_favorite)
    }

    // Verify the user owns the list
    const { data: existingList, error: checkError } = await supabase
      .from('sourcing_lists')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (checkError || !existingList) {
      return NextResponse.json(
        { error: 'Sourcing list not found' },
        { status: 404 }
      )
    }

    // Update the list
    const { data: updatedList, error } = await supabase
      .from('sourcing_lists')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating sourcing list:', error)
      return NextResponse.json(
        { error: 'Failed to update sourcing list' },
        { status: 500 }
      )
    }

    return NextResponse.json({ list: updatedList })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    console.error('Error in PATCH /api/sourcing-lists/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete sourcing list
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await validateApiRequest(request)
    
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

    // Verify the user owns the list
    const { data: existingList, error: checkError } = await supabase
      .from('sourcing_lists')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (checkError || !existingList) {
      return NextResponse.json(
        { error: 'Sourcing list not found' },
        { status: 404 }
      )
    }

    // Delete the list (cascade will delete items automatically)
    const { error } = await supabase
      .from('sourcing_lists')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting sourcing list:', error)
      return NextResponse.json(
        { error: 'Failed to delete sourcing list' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    console.error('Error in DELETE /api/sourcing-lists/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}