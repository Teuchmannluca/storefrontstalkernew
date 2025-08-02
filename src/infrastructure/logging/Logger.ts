import { ILogger, LogContext, LogLevel } from './ILogger';

/**
 * Structured logger implementation
 */
export class Logger implements ILogger {
  private context: LogContext;

  constructor(
    private name: string,
    private level: LogLevel = LogLevel.INFO,
    context: LogContext = {}
  ) {
    this.context = context;
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };
    
    this.log(LogLevel.ERROR, message, errorContext);
  }

  child(context: LogContext): ILogger {
    return new Logger(
      this.name,
      this.level,
      { ...this.context, ...context }
    );
  }

  startTimer(): () => void {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      return duration;
    };
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      message,
      ...this.context,
      ...context
    };

    // In production, send to logging service
    // For now, use console with structured output
    const logMethod = this.getConsoleMethod(level);
    logMethod(JSON.stringify(logEntry));
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
        return console.error;
      default:
        return console.log;
    }
  }
}

/**
 * Logger factory for creating loggers with consistent configuration
 */
export class LoggerFactory {
  private static loggers: Map<string, ILogger> = new Map();
  private static defaultLevel: LogLevel = LogLevel.INFO;

  static setDefaultLevel(level: LogLevel): void {
    this.defaultLevel = level;
  }

  static getLogger(name: string, context?: LogContext): ILogger {
    const key = `${name}:${JSON.stringify(context || {})}`;
    
    if (!this.loggers.has(key)) {
      const logger = new Logger(name, this.defaultLevel, context);
      this.loggers.set(key, logger);
    }
    
    return this.loggers.get(key)!;
  }

  static createLogger(name: string, context?: LogContext): ILogger {
    return new Logger(name, this.defaultLevel, context);
  }
}