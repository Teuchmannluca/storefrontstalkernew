import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkEnvVars } from '@/lib/env-check';
import { validateApiRequest } from '@/lib/auth';
import { validateRequestBody, apiSchemas } from '@/lib/validation';
import { AppError } from '@/lib/error-handling';
import { container, initializeContainer, TOKENS } from '@/infrastructure/container';
import { IArbitrageService } from '@/domain/interfaces/IArbitrageService';
import { StreamingService } from '@/services/streaming/StreamingService';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Validate request body
    const body = await request.json();
    const { storefrontId, asins, debug = false } = body;

    // Check required environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true },
      aws: { accessKeyId: true, secretAccessKey: true },
      amazon: { accessKeyId: true, secretAccessKey: true, refreshToken: true, marketplaceId: true }
    });

    if (!envCheck.success) {
      throw new AppError(
        'Service temporarily unavailable',
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Initialize dependency injection container
    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );
    
    initializeContainer(supabase);

    // Get services from container
    const arbitrageService = container.resolve<IArbitrageService>(TOKENS.ArbitrageService);
    const streamingService = container.resolve(StreamingService);

    // Create async generator for arbitrage analysis
    async function* analyzeArbitrage() {
      if (storefrontId) {
        const result = await arbitrageService.analyzeStorefront(
          storefrontId,
          user.id,
          (message) => {
            // Yield each progress message
            return message;
          }
        );
        yield { type: 'complete', data: result };
      } else if (asins && asins.length > 0) {
        const result = await arbitrageService.analyzeASINs(
          asins,
          user.id,
          (message) => {
            // Yield each progress message
            return message;
          }
        );
        yield { type: 'complete', data: result };
      } else {
        throw new AppError(
          'Either storefrontId or asins must be provided',
          400,
          'INVALID_REQUEST'
        );
      }
    }

    // Create SSE stream
    const stream = streamingService.createSSEStream(
      analyzeArbitrage(),
      (message) => message as any
    );

    // Return SSE response
    return streamingService.createSSEResponse(stream);

  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    console.error('Unhandled error in analyze-stream:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}