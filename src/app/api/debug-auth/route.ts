import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  console.log('Debug Auth Endpoint Called')
  console.log('Auth header:', authHeader)
  console.log('Service role key (first 10 chars):', serviceRoleKey?.substring(0, 10))
  console.log('Auth header starts with Bearer:', authHeader?.startsWith('Bearer '))
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    console.log('Token (first 10 chars):', token.substring(0, 10))
    console.log('Token matches service role key:', token === serviceRoleKey)
  }
  
  return NextResponse.json({ 
    authHeaderPresent: !!authHeader,
    serviceRoleKeyPresent: !!serviceRoleKey,
    authHeaderValid: authHeader?.startsWith('Bearer '),
    match: authHeader && authHeader.startsWith('Bearer ') && authHeader.substring(7) === serviceRoleKey
  })
}