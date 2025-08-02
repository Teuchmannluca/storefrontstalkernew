import { ILogger } from '../logging/ILogger';
import { LoggerFactory } from '../logging/Logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;      // Number of failures before opening
  resetTimeout: number;          // Milliseconds to wait before trying again
  halfOpenMaxAttempts?: number;  // Max attempts in half-open state
  monitoringPeriod?: number;     // Time window for counting failures (ms)
  volumeThreshold?: number;      // Minimum requests before opening circuit
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  halfOpenAttempts?: number;
}

/**
 * Circuit breaker implementation for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  private halfOpenAttempts = 0;
  private requestTimestamps: number[] = [];
  private logger: ILogger;

  constructor(private config: CircuitBreakerConfig) {
    this.logger = LoggerFactory.getLogger(`CircuitBreaker:${config.name}`);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.config.name}' is OPEN`,
        this.getState()
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Wrap a function with circuit breaker protection
   */
  wrap<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: Parameters<T>) => {
      return this.execute(() => fn(...args));
    }) as T;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      halfOpenAttempts: this.halfOpenAttempts
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    this.halfOpenAttempts = 0;
    this.requestTimestamps = [];
    
    this.logger.info('Circuit breaker reset');
  }

  private canExecute(): boolean {
    this.cleanupOldTimestamps();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      
      case CircuitState.OPEN:
        if (this.shouldAttemptReset()) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;
      
      case CircuitState.HALF_OPEN:
        const maxAttempts = this.config.halfOpenMaxAttempts || 1;
        return this.halfOpenAttempts < maxAttempts;
      
      default:
        return false;
    }
  }

  private onSuccess(): void {
    this.requestTimestamps.push(Date.now());

    switch (this.state) {
      case CircuitState.CLOSED:
        this.successes++;
        break;
      
      case CircuitState.HALF_OPEN:
        this.successes++;
        this.transitionToClosed();
        break;
    }
  }

  private onFailure(): void {
    this.requestTimestamps.push(Date.now());
    this.failures++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.shouldOpen()) {
          this.transitionToOpen();
        }
        break;
      
      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts++;
        this.transitionToOpen();
        break;
    }
  }

  private shouldOpen(): boolean {
    // Check if we have enough volume
    const volumeThreshold = this.config.volumeThreshold || 1;
    if (this.requestTimestamps.length < volumeThreshold) {
      return false;
    }

    // Check if failures exceed threshold
    const recentFailures = this.getRecentFailures();
    return recentFailures >= this.config.failureThreshold;
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return false;
    }
    
    return Date.now() >= this.nextAttemptTime;
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    
    this.logger.warn('Circuit breaker opened', {
      failures: this.failures,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
    });
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenAttempts = 0;
    
    this.logger.info('Circuit breaker half-open');
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = undefined;
    
    this.logger.info('Circuit breaker closed');
  }

  private getRecentFailures(): number {
    const monitoringPeriod = this.config.monitoringPeriod || 60000; // 1 minute default
    const cutoff = Date.now() - monitoringPeriod;
    
    // Count failures in the monitoring period
    // In a real implementation, we'd track success/failure separately
    // For simplicity, using the total failure count if within period
    if (this.lastFailureTime && this.lastFailureTime > cutoff) {
      return this.failures;
    }
    
    return 0;
  }

  private cleanupOldTimestamps(): void {
    const monitoringPeriod = this.config.monitoringPeriod || 60000;
    const cutoff = Date.now() - monitoringPeriod;
    
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > cutoff);
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    message: string,
    public state: CircuitBreakerState
  ) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit breaker factory for managing multiple breakers
 */
export class CircuitBreakerFactory {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  static create(config: CircuitBreakerConfig): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      return this.breakers.get(config.name)!;
    }

    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.name, breaker);
    
    return breaker;
  }

  static get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  static reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  static resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  static getStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();
    
    this.breakers.forEach((breaker, name) => {
      states.set(name, breaker.getState());
    });
    
    return states;
  }
}