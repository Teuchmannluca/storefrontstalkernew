/**
 * Secure error handling utilities to prevent information disclosure
 */

export interface SecureError {
  message: string
  statusCode: number
  code?: string
  field?: string
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public field?: string,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Maps internal errors to safe client responses
 */
export function getClientSafeError(error: any): SecureError {
  // Log the full error for debugging (server-side only)
  if (typeof window === 'undefined') {
    console.error('[ERROR_LOG]', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...(error.statusCode && { statusCode: error.statusCode }),
      ...(error.code && { code: error.code })
    })
  }

  // Return sanitized error for client
  if (error instanceof AppError) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      field: error.field
    }
  }

  // Handle specific error types with safe messages
  if (error.message?.includes('not found')) {
    return {
      message: 'Resource not found',
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND'
    }
  }

  if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
    return {
      message: 'Access denied',
      statusCode: 403,
      code: 'ACCESS_DENIED'
    }
  }

  if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
    return {
      message: 'Resource already exists',
      statusCode: 409,
      code: 'DUPLICATE_RESOURCE'
    }
  }

  if (error.message?.includes('validation') || error.message?.includes('invalid')) {
    return {
      message: 'Invalid input provided',
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    }
  }

  if (error.message?.includes('rate') || error.message?.includes('limit')) {
    return {
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }

  if (error.message?.includes('timeout')) {
    return {
      message: 'Request timeout. Please try again.',
      statusCode: 408,
      code: 'REQUEST_TIMEOUT'
    }
  }

  // Database connection errors
  if (error.message?.includes('connect') || error.message?.includes('database')) {
    return {
      message: 'Service temporarily unavailable',
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE'
    }
  }

  // External API errors
  if (error.message?.includes('Amazon') || error.message?.includes('SP-API')) {
    return {
      message: 'External service error. Please try again later.',
      statusCode: 502,
      code: 'EXTERNAL_SERVICE_ERROR'
    }
  }

  // Generic server error (hide all details)
  return {
    message: 'An unexpected error occurred. Please try again.',
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR'
  }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: any): Response {
  const safeError = getClientSafeError(error)
  
  return Response.json(
    {
      error: safeError.message,
      code: safeError.code,
      ...(safeError.field && { field: safeError.field })
    },
    { status: safeError.statusCode }
  )
}

/**
 * Async error handler wrapper for API routes
 */
export function withErrorHandler(
  handler: (request: Request, context?: any) => Promise<Response>
) {
  return async (request: Request, context?: any): Promise<Response> => {
    try {
      return await handler(request, context)
    } catch (error) {
      return createErrorResponse(error)
    }
  }
}

/**
 * Sanitizes sensitive data from objects before logging
 */
export function sanitizeForLogging(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  const sensitiveKeys = [
    'password', 'token', 'key', 'secret', 'authorization', 
    'auth', 'credential', 'api_key', 'access_token', 'refresh_token'
  ]

  const sanitized = { ...obj }

  for (const key in sanitized) {
    if (sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive.toLowerCase())
    )) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLogging(sanitized[key])
    }
  }

  return sanitized
}

/**
 * Stream-safe error sending for SSE endpoints
 */
export function sendStreamError(error: any, sendMessage: (data: any) => void): void {
  const safeError = getClientSafeError(error)
  
  try {
    sendMessage({ 
      type: 'error', 
      data: { 
        error: safeError.message,
        code: safeError.code 
      } 
    })
  } catch (streamError) {
    // If we can't send the error via stream, log it
    console.error('[STREAM_ERROR]', sanitizeForLogging(streamError))
  }
}

/**
 * Error categories for monitoring and alerting
 */
export enum ErrorCategory {
  AUTH = 'authentication',
  VALIDATION = 'validation',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
  RATE_LIMIT = 'rate_limit',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system'
}

/**
 * Enhanced error for monitoring purposes
 */
export class MonitoredError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public category: ErrorCategory,
    code?: string,
    field?: string
  ) {
    super(message, statusCode, code, field)
    this.name = 'MonitoredError'
  }
}