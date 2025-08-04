import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateApiRequest, AuthError } from '@/lib/auth'
import { checkEnvVars } from '@/lib/env-check'

// GET - Get items in a sourcing list
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await validateApiRequest(request)
    const { id } = await params
    
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
    const { data: list, error: listError } = await supabase
      .from('sourcing_lists')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (listError || !list) {
      return NextResponse.json(
        { error: 'Sourcing list not found' },
        { status: 404 }
      )
    }

    // Get items in the list
    const { data: items, error } = await supabase
      .from('sourcing_list_items')
      .select('*')
      .eq('sourcing_list_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching sourcing list items:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sourcing list items' },
        { status: 500 }
      )
    }

    return NextResponse.json({ items: items || [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    console.error('Error in GET /api/sourcing-lists/[id]/items:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Remove item from sourcing list
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await validateApiRequest(request)
    const { id } = await params
    
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
    const { item_id } = body

    if (!item_id) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      )
    }

    // Verify user owns the list that contains this item
    const { data: item, error: itemError } = await supabase
      .from('sourcing_list_items')
      .select(`
        id,
        sourcing_lists!inner(user_id)
      `)
      .eq('id', item_id)
      .eq('sourcing_list_id', id)
      .single()

    if (itemError || !item || (item.sourcing_lists as any).user_id !== user.id) {
      return NextResponse.json(
        { error: 'Item not found or access denied' },
        { status: 404 }
      )
    }

    // Delete the item
    const { error } = await supabase
      .from('sourcing_list_items')
      .delete()
      .eq('id', item_id)
      .eq('sourcing_list_id', id)

    if (error) {
      console.error('Error deleting sourcing list item:', error)
      return NextResponse.json(
        { error: 'Failed to delete item' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    console.error('Error in DELETE /api/sourcing-lists/[id]/items:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}