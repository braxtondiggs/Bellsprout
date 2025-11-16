import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Middleware to add correlation IDs to requests for tracing
 * Allows tracking a request through multiple services and async operations
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check if correlation ID already exists in header (from upstream service)
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      (req.headers['x-request-id'] as string) ||
      randomUUID();

    // Store correlation ID in request for access by services
    (req as any).correlationId = correlationId;

    // Add correlation ID to response header for client tracking
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}

/**
 * Helper to get correlation ID from request
 */
export function getCorrelationId(req: Request): string {
  return (req as any).correlationId || 'unknown';
}
