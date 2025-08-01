// Environment variable validation utility

export interface RequiredEnvVars {
  supabase?: {
    url?: boolean;
    serviceKey?: boolean;
    anonKey?: boolean;
  };
  aws?: {
    accessKeyId?: boolean;
    secretAccessKey?: boolean;
    region?: boolean;
  };
  amazon?: {
    accessKeyId?: boolean;
    secretAccessKey?: boolean;
    refreshToken?: boolean;
    marketplaceId?: boolean;
  };
  keepa?: {
    apiKey?: boolean;
  };
}

export function checkEnvVars(required: RequiredEnvVars): {
  success: boolean;
  missing: string[];
  values: Record<string, string>;
} {
  const missing: string[] = [];
  const values: Record<string, string> = {};

  // Check Supabase vars
  if (required.supabase?.url) {
    const val = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!val) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    else values.supabaseUrl = val;
  }
  if (required.supabase?.serviceKey) {
    const val = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!val) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    else values.supabaseServiceKey = val;
  }
  if (required.supabase?.anonKey) {
    const val = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!val) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    else values.supabaseAnonKey = val;
  }

  // Check AWS vars
  if (required.aws?.accessKeyId) {
    const val = process.env.AWS_ACCESS_KEY_ID;
    if (!val) missing.push('AWS_ACCESS_KEY_ID');
    else values.awsAccessKeyId = val;
  }
  if (required.aws?.secretAccessKey) {
    const val = process.env.AWS_SECRET_ACCESS_KEY;
    if (!val) missing.push('AWS_SECRET_ACCESS_KEY');
    else values.awsSecretAccessKey = val;
  }
  if (required.aws?.region) {
    const val = process.env.AWS_REGION || 'eu-west-1';
    values.awsRegion = val;
  }

  // Check Amazon SP-API vars
  if (required.amazon?.accessKeyId) {
    const val = process.env.AMAZON_ACCESS_KEY_ID;
    if (!val) missing.push('AMAZON_ACCESS_KEY_ID');
    else values.amazonAccessKeyId = val;
  }
  if (required.amazon?.secretAccessKey) {
    const val = process.env.AMAZON_SECRET_ACCESS_KEY;
    if (!val) missing.push('AMAZON_SECRET_ACCESS_KEY');
    else values.amazonSecretAccessKey = val;
  }
  if (required.amazon?.refreshToken) {
    const val = process.env.AMAZON_REFRESH_TOKEN;
    if (!val) missing.push('AMAZON_REFRESH_TOKEN');
    else values.amazonRefreshToken = val;
  }
  if (required.amazon?.marketplaceId) {
    const val = process.env.AMAZON_MARKETPLACE_ID || 'A1F83G8C2ARO7P';
    values.amazonMarketplaceId = val;
  }

  // Check Keepa vars
  if (required.keepa?.apiKey) {
    const val = process.env.KEEPA_API_KEY;
    if (!val) missing.push('KEEPA_API_KEY');
    else values.keepaApiKey = val;
  }

  return {
    success: missing.length === 0,
    missing,
    values
  };
}