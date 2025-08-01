// Oxylabs ISP Proxy Configuration
const proxyList = require('../../Proxy lists (2).json');

// Transform Oxylabs format to our proxy format
const OXYLABS_PROXIES = proxyList.map((proxy: any) => ({
  host: proxy.entryPoint,
  port: proxy.port,
  username: process.env.OXYLABS_USERNAME || '',
  password: process.env.OXYLABS_PASSWORD || '',
  protocol: 'http' as const,
  countryCode: proxy.countryCode,
  originalIP: proxy.ip
}));

// Fallback manual list if file loading fails
const FALLBACK_PROXIES = [
  { host: 'isp.oxylabs.io', port: 8001, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8002, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8003, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8004, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8005, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8006, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8007, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8008, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8009, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8010, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8011, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8012, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8013, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8014, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8015, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8016, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8017, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8018, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8019, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const },
  { host: 'isp.oxylabs.io', port: 8020, username: process.env.OXYLABS_USERNAME || '', password: process.env.OXYLABS_PASSWORD || '', protocol: 'http' as const }
];

// Environment-based configuration
export const PROXY_CONFIG = {
  residentialProxies: process.env.PROXY_LIST ? 
    JSON.parse(process.env.PROXY_LIST) : 
    (OXYLABS_PROXIES.length > 0 ? OXYLABS_PROXIES : FALLBACK_PROXIES),
  
  circuitBreaker: {
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURES || '3'),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET || '60000')
  },
  
  rateLimits: {
    proxy: {
      requestsPerMinute: parseInt(process.env.PROXY_RATE_LIMIT || '30'),
      burstAllowance: parseInt(process.env.PROXY_BURST_ALLOWANCE || '5')
    },
    seller: {
      requestsPerMinute: parseInt(process.env.SELLER_RATE_LIMIT || '10'),
      burstAllowance: parseInt(process.env.SELLER_BURST_ALLOWANCE || '2')
    }
  },
  
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000')
  }
};

// Validation function
export function validateProxyConfig(proxies: any[]): boolean {
  return proxies.every(proxy => 
    proxy.host && 
    proxy.port && 
    typeof proxy.port === 'number' && 
    proxy.port > 0 && 
    proxy.port < 65536
  );
}