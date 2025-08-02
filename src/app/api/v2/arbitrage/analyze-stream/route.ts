import { NextRequest } from 'next/server';
import { VersionedRouteBuilder, APIVersion, ResponseTransformer } from '@/infrastructure/api-versioning/APIVersioning';
import { createApiHandler } from '@/middleware/error-handler';

/**
 * Example of versioned API route
 * This demonstrates how to support multiple API versions
 */

// V1 handler (legacy)
const v1Handler = createApiHandler(async (request: NextRequest) => {
  // V1 implementation (simplified response format)
  const result = await performAnalysis(request);
  return ResponseTransformer.transformForVersion(result, APIVersion.V1);
});

// V2 handler (current)
const v2Handler = createApiHandler(async (request: NextRequest) => {
  // V2 implementation (full response format)
  const result = await performAnalysis(request);
  return ResponseTransformer.transformForVersion(result, APIVersion.V2);
});

// Build versioned route
export const POST = new VersionedRouteBuilder()
  .addRoute(APIVersion.V1, v1Handler, {
    deprecated: true,
    deprecationDate: new Date('2025-01-01'),
    migrationGuide: 'https://docs.example.com/api/v2/migration'
  })
  .addRoute(APIVersion.V2, v2Handler)
  .build();

// Shared analysis logic
async function performAnalysis(request: NextRequest) {
  // Implementation would go here
  // This is just a placeholder
  return {
    opportunities: [],
    opportunitiesFound: 0
  };
}