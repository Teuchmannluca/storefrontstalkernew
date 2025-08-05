import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Basic health check - verify environment variables are set
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'AMAZON_ACCESS_KEY_ID',
      'AMAZON_SECRET_ACCESS_KEY',
      'AMAZON_REFRESH_TOKEN',
      'KEEPA_API_KEY'
    ]

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

    if (missingVars.length > 0) {
      return NextResponse.json({
        status: 'unhealthy',
        message: 'Missing required environment variables',
        missing: missingVars
      }, { status: 500 })
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    })
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}