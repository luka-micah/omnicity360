// Application error classes and error handler
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

interface ZodIssueLike {
  path?: Array<string | number>;
  message?: string;
  code?: string;
}

/**
 * Detect Zod errors structurally. Vite may load the contracts package and this
 * package with different module instances, so instanceof is not reliable.
 */
function getZodIssues(error: unknown): ZodIssueLike[] | null {
  if (typeof error !== 'object' || error === null || !('issues' in error)) return null;
  const issues = (error as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as ZodIssueLike[]) : null;
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 409, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_ERROR', message, 500);
  }
}

/** Safe error response - never exposes stack traces or internal details */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;
  const zodIssues = getZodIssues(error);
  const fastifyIssues =
    'validation' in error && Array.isArray(error.validation) && error.validation.length > 0
      ? error.validation
      : null;

  // Log the full error internally, but do not treat client validation errors as server faults.
  if (zodIssues || fastifyIssues) {
    request.log.warn({ err: error, code: 'VALIDATION_ERROR' }, 'Request validation failed');
  } else if (
    (error instanceof AppError && error.statusCode < 500) ||
    ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500)
  ) {
    request.log.warn({ err: error }, 'Request rejected');
  } else {
    request.log.error({ err: error }, 'Unhandled error');
  }

  // Zod validation errors (including errors from another package instance)
  if (zodIssues) {
    reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: {
          issues: zodIssues.map((issue) => ({
            path: issue.path?.join('.') ?? '',
            message: issue.message ?? 'Invalid value',
            code: issue.code ?? 'invalid',
          })),
        },
      },
    } satisfies ErrorResponse);
    return;
  }

  // Fastify/AJV request validation errors (body, params, query)
  if (fastifyIssues) {
    reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: {
          issues: fastifyIssues.map((issue) => ({
            path: issue.instancePath ? issue.instancePath.slice(1).replaceAll('/', '.') : '',
            message: issue.message ?? 'Invalid value',
            code: issue.keyword ?? 'invalid',
          })),
        },
      },
    } satisfies ErrorResponse);
    return;
  }

  // Known application errors
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    } satisfies ErrorResponse);
    return;
  }

  // Fastify built-in errors (e.g., body parse errors, 404)
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    const code =
      statusCode === 404
        ? 'NOT_FOUND'
        : statusCode === 413
          ? 'PAYLOAD_TOO_LARGE'
          : statusCode === 429
            ? 'RATE_LIMITED'
            : 'BAD_REQUEST';
    reply.status(statusCode).send({
      error: {
        code,
        message:
          statusCode === 404
            ? 'Route not found'
            : statusCode === 429
              ? 'Too many requests'
              : 'Request could not be processed',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // Unknown errors: return generic message, never leak internals
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  } satisfies ErrorResponse);
}
