/**
 * RFC 7807 Problem Details and Centralized Application Errors
 */

export interface ErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: ErrorDetails) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: ErrorDetails) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: ErrorDetails) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource Not Found', details?: ErrorDetails) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict / Duplicate Entry', details?: ErrorDetails) {
    super(409, 'CONFLICT', message, details);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'Plan Quota Exceeded', details?: ErrorDetails) {
    super(429, 'QUOTA_EXCEEDED', message, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details?: ErrorDetails) {
    super(500, 'INTERNAL_SERVER_ERROR', message, details);
  }
}
