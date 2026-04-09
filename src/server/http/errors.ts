export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown[] | null;

  constructor(statusCode: number, message: string, code = 'API_ERROR', details: unknown[] | null = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', details: unknown[] | null = null) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthenticated') {
    super(401, message, 'UNAUTHENTICATED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message, 'CONFLICT');
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(message = 'Unprocessable entity', details: unknown[] | null = null) {
    super(422, message, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service unavailable', details: unknown[] | null = null) {
    super(503, message, 'SERVICE_UNAVAILABLE', details);
  }
}
