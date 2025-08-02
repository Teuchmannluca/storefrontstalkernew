import { 
  IMonitoring, 
  ISpan, 
  MetricTags, 
  SpanAttributes, 
  SpanStatusCode 
} from '../logging/ILogger';

/**
 * OpenTelemetry-style monitoring implementation
 */
export class Monitoring implements IMonitoring {
  private metrics: Map<string, any[]> = new Map();

  recordMetric(name: string, value: number, tags?: MetricTags): void {
    const metric = {
      name,
      value,
      tags,
      timestamp: Date.now()
    };
    
    this.addMetric(name, metric);
    
    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[METRIC] ${name}:`, value, tags);
    }
  }

  incrementCounter(name: string, tags?: MetricTags): void {
    const key = this.getMetricKey(name, tags);
    const current = this.getCounterValue(key);
    
    this.recordMetric(name, current + 1, tags);
  }

  recordHistogram(name: string, value: number, tags?: MetricTags): void {
    const histogram = {
      name,
      value,
      tags,
      timestamp: Date.now(),
      type: 'histogram'
    };
    
    this.addMetric(`${name}_histogram`, histogram);
  }

  setGauge(name: string, value: number, tags?: MetricTags): void {
    const gauge = {
      name,
      value,
      tags,
      timestamp: Date.now(),
      type: 'gauge'
    };
    
    this.metrics.set(this.getMetricKey(name, tags), [gauge]);
  }

  startSpan(name: string, attributes?: SpanAttributes): ISpan {
    return new Span(name, attributes);
  }

  private addMetric(name: string, metric: any): void {
    const metrics = this.metrics.get(name) || [];
    metrics.push(metric);
    this.metrics.set(name, metrics);
    
    // Keep only last 1000 metrics per name to prevent memory leak
    if (metrics.length > 1000) {
      metrics.shift();
    }
  }

  private getMetricKey(name: string, tags?: MetricTags): string {
    if (!tags) return name;
    
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${name}{${tagString}}`;
  }

  private getCounterValue(key: string): number {
    const metrics = this.metrics.get(key) || [];
    const lastMetric = metrics[metrics.length - 1];
    return lastMetric?.value || 0;
  }
}

/**
 * Span implementation for distributed tracing
 */
class Span implements ISpan {
  private startTime: number;
  private events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }> = [];
  private status?: { code: SpanStatusCode; message?: string };
  private ended = false;

  constructor(
    private name: string,
    private attributes: SpanAttributes = {}
  ) {
    this.startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[SPAN START] ${name}`, attributes);
    }
  }

  setAttributes(attributes: SpanAttributes): void {
    if (this.ended) return;
    
    this.attributes = { ...this.attributes, ...attributes };
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    if (this.ended) return;
    
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes
    });
  }

  setStatus(code: SpanStatusCode, message?: string): void {
    if (this.ended) return;
    
    this.status = { code, message };
  }

  end(): void {
    if (this.ended) return;
    
    this.ended = true;
    const duration = Date.now() - this.startTime;
    
    const spanData = {
      name: this.name,
      startTime: this.startTime,
      endTime: Date.now(),
      duration,
      attributes: this.attributes,
      events: this.events,
      status: this.status || { code: SpanStatusCode.OK }
    };
    
    // In production, send to tracing backend
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[SPAN END] ${this.name}`, {
        duration: `${duration}ms`,
        status: spanData.status,
        attributes: this.attributes
      });
    }
  }
}

/**
 * Global monitoring instance
 */
export const monitoring = new Monitoring();

/**
 * Monitoring decorators for methods
 */
export function MonitorPerformance(spanName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const span = monitoring.startSpan(spanName || `${target.constructor.name}.${propertyKey}`);
      const timer = Date.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        span.setStatus(SpanStatusCode.OK);
        return result;
      } catch (error) {
        span.setStatus(SpanStatusCode.ERROR, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      } finally {
        const duration = Date.now() - timer;
        span.setAttributes({ duration });
        span.end();
        
        monitoring.recordHistogram(
          `method.duration`,
          duration,
          {
            class: target.constructor.name,
            method: propertyKey
          }
        );
      }
    };
    
    return descriptor;
  };
}