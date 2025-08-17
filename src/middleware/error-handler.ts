import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/infrastructure/error-handling/ErrorHandler';

/**
 * Global error handling middleware
 * Wraps all API routes with error handling
 */
export async function errorHandlerMiddleware(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    // Log error details - sanitize user input to prevent format string injection
    const method = String(request.method).replace(/%/g, '%%');
    const url = String(request.url).replace(/%/g, '%%');
    console.error('[%s] %s:', method, url, error);
    
    // Return error response
    return ErrorHandler.getInstance().handleError(error);
  }
}

/**
 * Create wrapped API route handler
 */
export function createApiHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    return errorHandlerMiddleware(request, () => handler(request, ...args));
  };
}