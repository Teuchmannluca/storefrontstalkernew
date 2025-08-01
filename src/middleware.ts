import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // For now, we'll handle auth check in the client components
  // This is a placeholder for future server-side auth implementation
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
}