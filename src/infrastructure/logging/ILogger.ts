export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  
  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): ILogger;
  
  /**
   * Start a timer for performance measurement
   */
  startTimer(): () => void;
}

export interface LogContext {
  [key: string]: any;
  userId?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  asin?: string;
  storefrontId?: string;
  scanId?: string;
  duration?: number;
}

export interface IMonitoring {
  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, tags?: MetricTags): void;
  
  /**
   * Increment a counter
   */
  incrementCounter(name: string, tags?: MetricTags): void;
  
  /**
   * Record histogram data (e.g., response times)
   */
  recordHistogram(name: string, value: number, tags?: MetricTags): void;
  
  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, tags?: MetricTags): void;
  
  /**
   * Start a span for distributed tracing
   */
  startSpan(name: string, attributes?: SpanAttributes): ISpan;
}

export interface MetricTags {
  [key: string]: string | number;
}

export interface SpanAttributes {
  [key: string]: any;
}

export interface ISpan {
  /**
   * Add attributes to the span
   */
  setAttributes(attributes: SpanAttributes): void;
  
  /**
   * Record an event within the span
   */
  addEvent(name: string, attributes?: SpanAttributes): void;
  
  /**
   * Set the span status
   */
  setStatus(code: SpanStatusCode, message?: string): void;
  
  /**
   * End the span
   */
  end(): void;
}

export enum SpanStatusCode {
  OK = 'OK',
  ERROR = 'ERROR'
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}