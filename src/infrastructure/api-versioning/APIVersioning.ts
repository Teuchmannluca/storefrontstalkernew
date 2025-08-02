import { NextRequest, NextResponse } from 'next/server';

export enum APIVersion {
  V1 = 'v1',
  V2 = 'v2'
}

export interface VersionedRoute {
  version: APIVersion;
  handler: (request: NextRequest) => Promise<NextResponse>;
  deprecated?: boolean;
  deprecationDate?: Date;
  migrationGuide?: string;
}

/**
 * API versioning configuration
 */
export class APIVersionConfig {
  static readonly DEFAULT_VERSION = APIVersion.V1;
  static readonly SUPPORTED_VERSIONS = [APIVersion.V1, APIVersion.V2];
  static readonly VERSION_HEADER = 'X-API-Version';
  static readonly VERSION_QUERY_PARAM = 'api_version';
  static readonly DEPRECATION_HEADER = 'X-API-Deprecation';
}

/**
 * Extract API version from request
 */
export function extractAPIVersion(request: NextRequest): APIVersion {
  // 1. Check header first (highest priority)
  const headerVersion = request.headers.get(APIVersionConfig.VERSION_HEADER);
  if (headerVersion && isValidVersion(headerVersion)) {
    return headerVersion as APIVersion;
  }

  // 2. Check URL path
  const pathMatch = request.nextUrl.pathname.match(/\/api\/(v\d+)\//);
  if (pathMatch && isValidVersion(pathMatch[1])) {
    return pathMatch[1] as APIVersion;
  }

  // 3. Check query parameter
  const queryVersion = request.nextUrl.searchParams.get(APIVersionConfig.VERSION_QUERY_PARAM);
  if (queryVersion && isValidVersion(queryVersion)) {
    return queryVersion as APIVersion;
  }

  // 4. Default version
  return APIVersionConfig.DEFAULT_VERSION;
}

/**
 * Validate if version is supported
 */
function isValidVersion(version: string): boolean {
  return APIVersionConfig.SUPPORTED_VERSIONS.includes(version as APIVersion);
}

/**
 * Create versioned API route handler
 */
export function createVersionedRoute(routes: VersionedRoute[]) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestedVersion = extractAPIVersion(request);
    
    // Find matching route
    const route = routes.find(r => r.version === requestedVersion);
    
    if (!route) {
      return NextResponse.json(
        {
          error: 'Unsupported API version',
          requestedVersion,
          supportedVersions: APIVersionConfig.SUPPORTED_VERSIONS
        },
        { status: 400 }
      );
    }

    // Add deprecation warning if applicable
    const response = await route.handler(request);
    
    if (route.deprecated) {
      response.headers.set(
        APIVersionConfig.DEPRECATION_HEADER,
        JSON.stringify({
          deprecated: true,
          deprecationDate: route.deprecationDate?.toISOString(),
          migrationGuide: route.migrationGuide
        })
      );
    }

    return response;
  };
}

/**
 * Version-specific response transformers
 */
export class ResponseTransformer {
  static transformForVersion<T>(data: T, version: APIVersion): any {
    switch (version) {
      case APIVersion.V1:
        return this.transformToV1(data);
      case APIVersion.V2:
        return this.transformToV2(data);
      default:
        return data;
    }
  }

  private static transformToV1(data: any): any {
    // V1 response format (legacy)
    if (data.opportunities) {
      return {
        success: true,
        data: data.opportunities.map((opp: any) => ({
          asin: opp.asin,
          title: opp.productTitle,
          profit: opp.profitGBP,
          roi: opp.roi,
          source: opp.sourceMarketplace,
          // V1 doesn't include confidence score
        })),
        count: data.opportunitiesFound
      };
    }
    return data;
  }

  private static transformToV2(data: any): any {
    // V2 response format (current)
    return data;
  }
}

/**
 * API version middleware
 */
export function versionMiddleware(request: NextRequest): NextResponse | null {
  const version = extractAPIVersion(request);
  
  // Validate version
  if (!isValidVersion(version as string)) {
    return NextResponse.json(
      {
        error: 'Invalid API version',
        requestedVersion: version,
        supportedVersions: APIVersionConfig.SUPPORTED_VERSIONS
      },
      { status: 400 }
    );
  }

  // Add version to response headers
  const response = NextResponse.next();
  response.headers.set('X-API-Version', version);
  
  return null;
}

/**
 * Version-aware route builder
 */
export class VersionedRouteBuilder {
  private routes: Map<APIVersion, VersionedRoute> = new Map();

  addRoute(
    version: APIVersion,
    handler: (request: NextRequest) => Promise<NextResponse>,
    options?: {
      deprecated?: boolean;
      deprecationDate?: Date;
      migrationGuide?: string;
    }
  ): this {
    this.routes.set(version, {
      version,
      handler,
      ...options
    });
    return this;
  }

  build() {
    return createVersionedRoute(Array.from(this.routes.values()));
  }
}