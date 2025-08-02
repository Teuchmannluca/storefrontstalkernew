import { NextResponse } from 'next/server';

/**
 * Base error class for all application errors
 */
export abstract class BaseError extends Error {
  abstract statusCode: number;
  abstract errorCode: string;
  abstract isOperational: boolean;

  constructor(
    message: string,
    public details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Business logic errors (client's fault)
 */
export class BusinessError extends BaseError {
  statusCode = 400;
  isOperational = true;

  constructor(
    message: string,
    public errorCode: string,
    details?: any
  ) {
    super(message, details);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends BusinessError {
  statusCode = 422;
  
  constructor(message: string, validationErrors?: any) {
    super(message, 'VALIDATION_ERROR', validationErrors);
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends BaseError {
  statusCode = 401;
  errorCode = 'AUTHENTICATION_ERROR';
  isOperational = true;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends BaseError {
  statusCode = 403;
  errorCode = 'AUTHORIZATION_ERROR';
  isOperational = true;

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends BaseError {
  statusCode = 404;
  errorCode = 'NOT_FOUND';
  isOperational = true;

  constructor(resource: string, identifier?: string) {
    super(
      identifier 
        ? `${resource} with identifier '${identifier}' not found`
        : `${resource} not found`
    );
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends BaseError {
  statusCode = 429;
  errorCode = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;

  constructor(
    retryAfter?: number,
    message = 'Rate limit exceeded'
  ) {
    super(message, { retryAfter });
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends BaseError {
  statusCode = 502;
  errorCode = 'EXTERNAL_SERVICE_ERROR';
  isOperational = true;

  constructor(
    service: string,
    originalError?: any
  ) {
    super(`External service '${service}' is unavailable`, {
      service,
      originalError: originalError?.message || originalError
    });
  }
}

/**
 * Infrastructure errors (server's fault)
 */
export class InfrastructureError extends BaseError {
  statusCode = 500;
  errorCode = 'INTERNAL_SERVER_ERROR';
  isOperational = false;

  constructor(message = 'An unexpected error occurred', details?: any) {
    super(message, details);
  }
}

/**
 * Global error handler
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCallbacks: Array<(error: Error) => void> = [];

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Register error callback for monitoring/logging
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Handle error and return appropriate response
   */
  handleError(error: unknown): NextResponse {
    // Notify all registered callbacks
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error as Error);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });

    // Handle known errors
    if (error instanceof BaseError) {
      return this.handleKnownError(error);
    }

    // Handle unknown errors
    return this.handleUnknownError(error);
  }

  private handleKnownError(error: BaseError): NextResponse {
    const response = {
      error: {
        code: error.errorCode,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && {
          details: error.details,
          stack: error.stack
        })
      }
    };

    // Add specific headers for certain error types
    const headers: Record<string, string> = {};
    
    if (error instanceof RateLimitError && error.details?.retryAfter) {
      headers['Retry-After'] = error.details.retryAfter.toString();
    }

    return NextResponse.json(response, {
      status: error.statusCode,
      headers
    });
  }

  private handleUnknownError(error: unknown): NextResponse {
    console.error('Unhandled error:', error);

    const response = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && {
          details: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
      }
    };

    return NextResponse.json(response, { status: 500 });
  }

  /**
   * Wrap async route handlers with error handling
   */
  static asyncHandler<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R | NextResponse> {
    return async (...args: T) => {
      try {
        return await fn(...args);
      } catch (error) {
        return ErrorHandler.getInstance().handleError(error);
      }
    };
  }
}

/**
 * Error boundary for streaming responses
 */
export class StreamErrorHandler {
  static handleStreamError(
    controller: ReadableStreamDefaultController,
    error: unknown
  ): void {
    let errorMessage: any;

    if (error instanceof BaseError) {
      errorMessage = {
        type: 'error',
        data: {
          code: error.errorCode,
          message: error.message,
          statusCode: error.statusCode
        }
      };
    } else if (error instanceof Error) {
      errorMessage = {
        type: 'error',
        data: {
          code: 'STREAM_ERROR',
          message: error.message
        }
      };
    } else {
      errorMessage = {
        type: 'error',
        data: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred'
        }
      };
    }

    try {
      const data = `data: ${JSON.stringify(errorMessage)}\n\n`;
      controller.enqueue(new TextEncoder().encode(data));
    } catch (encodeError) {
      console.error('Failed to send error through stream:', encodeError);
    }
  }
}