import { z } from 'zod'

// Common validation schemas
export const schemas = {
  // Amazon ASIN format: 10 characters, alphanumeric
  asin: z.string().regex(/^[A-Z0-9]{10}$/, 'Invalid ASIN format'),
  
  // Amazon Seller ID format: Variable length, alphanumeric
  sellerId: z.string().regex(/^[A-Z0-9]{10,}$/, 'Invalid seller ID format'),
  
  // UUID v4 format
  uuid: z.string().uuid('Invalid UUID format'),
  
  // Email format
  email: z.string().email('Invalid email format'),
  
  // URL format
  url: z.string().url('Invalid URL format'),
  
  // Positive integer
  positiveInt: z.number().int().positive('Must be a positive integer'),
  
  // Boolean with default
  boolean: z.boolean().default(false),
  
  // Non-empty string
  nonEmptyString: z.string().min(1, 'String cannot be empty'),
  
  // Marketplace ID (Amazon format)
  marketplaceId: z.string().regex(/^[A-Z0-9]{13}$/, 'Invalid marketplace ID format'),
}

// API request schemas
export const apiSchemas = {
  // Storefront analysis request
  storefrontAnalysis: z.object({
    storefrontId: schemas.uuid,
    debug: schemas.boolean,
    maxProducts: z.number().int().min(1).max(1000).optional(),
  }),
  
  // Product sync request
  productSync: z.object({
    asins: z.array(schemas.asin).min(1).max(20), // Batch limit
    marketplaceId: schemas.marketplaceId.optional(),
  }),
  
  // Competitive pricing request
  competitivePricing: z.object({
    asin: schemas.asin,
    marketplaceId: schemas.marketplaceId,
    itemCondition: z.enum(['New', 'Used', 'Collectible', 'Refurbished']).default('New'),
  }),
  
  // Fee estimation request
  feeEstimation: z.object({
    asin: schemas.asin,
    price: z.number().positive('Price must be positive'),
    isMediaItem: schemas.boolean,
  }),
  
  // Storefront creation/update
  storefrontData: z.object({
    name: schemas.nonEmptyString,
    sellerId: schemas.sellerId,
    url: schemas.url.optional(),
    isActive: schemas.boolean,
  }),
  
  // Arbitrage scan configuration
  arbitrageScan: z.object({
    storefrontIds: z.array(schemas.uuid).min(1),
    includeMarketplaces: z.array(z.string()).min(1),
    minProfitMargin: z.number().min(0).max(100).default(10),
    maxPriceGBP: z.number().positive().optional(),
  }),
}

// Input sanitization helpers
export const sanitize = {
  /**
   * Sanitize string input to prevent XSS
   */
  string: (input: string): string => {
    return input
      .replace(/[<>\"']/g, '') // Remove potential HTML/script chars
      .trim()
      .substring(0, 1000) // Limit length
  },
  
  /**
   * Sanitize and validate ASIN
   */
  asin: (input: string): string => {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)
  },
  
  /**
   * Sanitize numeric input
   */
  number: (input: any): number | null => {
    const num = parseFloat(input)
    return isNaN(num) ? null : Math.max(0, Math.min(num, 1000000)) // Reasonable bounds
  },
}

// Validation error handling
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validates request body against a schema
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]
      throw new ValidationError(
        `Validation failed: ${firstError.message}`,
        firstError.path.join('.')
      )
    }
    throw new ValidationError('Invalid JSON format')
  }
}

/**
 * Validates URL parameters against a schema
 */
export function validateParams<T>(
  params: Record<string, string | string[]>,
  schema: z.ZodSchema<T>
): T {
  try {
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]
      throw new ValidationError(
        `Parameter validation failed: ${firstError.message}`,
        firstError.path.join('.')
      )
    }
    throw new ValidationError('Invalid parameters')
  }
}

/**
 * Creates a standardized validation error response
 */
export function createValidationErrorResponse(error: ValidationError | Error) {
  const statusCode = error instanceof ValidationError ? error.statusCode : 400
  const message = error.message || 'Validation failed'
  
  return Response.json(
    { 
      error: message,
      field: error instanceof ValidationError ? error.field : undefined
    },
    { status: statusCode }
  )
}