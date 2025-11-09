import { Injectable, Scope } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

/**
 * Custom logger service wrapping Pino logger
 * Provides a convenient API for logging throughout the application
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  constructor(@InjectPinoLogger() private readonly logger: PinoLogger) {}

  /**
   * Set the context for the logger
   */
  setContext(context: string) {
    this.logger.setContext(context);
  }

  /**
   * Log an informational message
   */
  log(message: string, ...args: any[]) {
    this.logger.info(message, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, trace?: string, context?: string) {
    if (context) {
      this.logger.error({ context, trace }, message);
    } else if (trace) {
      this.logger.error({ trace }, message);
    } else {
      this.logger.error(message);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]) {
    this.logger.warn(message, ...args);
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]) {
    this.logger.debug(message, ...args);
  }

  /**
   * Log a verbose/trace message
   */
  verbose(message: string, ...args: any[]) {
    this.logger.trace(message, ...args);
  }

  /**
   * Log a fatal error message
   */
  fatal(message: string, ...args: any[]) {
    this.logger.fatal(message, ...args);
  }

  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, any>): LoggerService {
    const childLogger = new LoggerService(this.logger);
    (childLogger as any).logger = this.logger.logger.child(bindings);
    return childLogger;
  }
}
