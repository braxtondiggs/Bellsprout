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

  /**
   * Log a job start event with structured metadata
   */
  logJobStart(
    jobName: string,
    jobId = 'unknown',
    metadata?: Record<string, any>
  ) {
    this.logger.info(
      {
        event: 'job.start',
        jobName,
        jobId,
        ...metadata,
      },
      `Job started: ${jobName}`
    );
  }

  /**
   * Log a job completion event with duration and result
   */
  logJobComplete(
    jobName: string,
    jobId = 'unknown',
    duration: number,
    result?: Record<string, any>
  ) {
    this.logger.info(
      {
        event: 'job.complete',
        jobName,
        jobId,
        duration,
        ...result,
      },
      `Job completed: ${jobName} (${duration}ms)`
    );
  }

  /**
   * Log a job failure event with error details
   */
  logJobFailed(
    jobName: string,
    jobId = 'unknown',
    error: Error,
    metadata?: Record<string, any>
  ) {
    this.logger.error(
      {
        event: 'job.failed',
        jobName,
        jobId,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
        ...metadata,
      },
      `Job failed: ${jobName} - ${error.message}`
    );
  }

  /**
   * Log a business event with structured metadata
   */
  logBusinessEvent(
    eventName: string,
    metadata: Record<string, any>,
    message?: string
  ) {
    this.logger.info(
      {
        event: `business.${eventName}`,
        ...metadata,
      },
      message || eventName
    );
  }

  /**
   * Log a performance metric
   */
  logPerformance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ) {
    this.logger.info(
      {
        event: 'performance',
        operation,
        duration,
        ...metadata,
      },
      `${operation} completed in ${duration}ms`
    );
  }

  /**
   * Log an external service call
   */
  logExternalCall(
    service: string,
    operation: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ) {
    const level = success ? 'info' : 'warn';
    this.logger[level](
      {
        event: 'external.call',
        service,
        operation,
        duration,
        success,
        ...metadata,
      },
      `${service}.${operation} ${
        success ? 'succeeded' : 'failed'
      } (${duration}ms)`
    );
  }

  /**
   * Log an enhanced error with full context
   */
  logError(operation: string, error: Error, metadata?: Record<string, any>) {
    this.logger.error(
      {
        event: 'error',
        operation,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
          code: (error as any).code,
        },
        ...metadata,
      },
      `Error in ${operation}: ${error.message}`
    );
  }
}
