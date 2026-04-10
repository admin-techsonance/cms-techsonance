import { ZodError } from 'zod';
import { apiError, type PaginationMeta } from '@/server/http/response';
import { ApiError, ServiceUnavailableError } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';
import { logApplicationError } from '@/server/logging/mongo-log';
import { authenticateRequest } from '@/server/auth/session';
import type { AppRole } from '@/server/auth/constants';

interface HandlerOptions {
  requireAuth?: boolean;
  roles?: AppRole[];
}

interface HandlerContext {
  requestId: string;
  auth: Awaited<ReturnType<typeof authenticateRequest>>;
}

function extractErrorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  const messages = [error.message];
  const cause = (error as Error & { cause?: unknown }).cause;

  if (cause instanceof Error) {
    messages.push(...extractErrorMessages(cause));
  } else if (typeof cause === 'string' && cause.trim().length > 0) {
    messages.push(cause);
  }

  return messages.filter((message) => typeof message === 'string' && message.trim().length > 0);
}

function isSchemaMismatchError(error: unknown) {
  const combined = extractErrorMessages(error).join(' | ').toLowerCase();

  return (
    combined.includes('no such table') ||
    combined.includes('no such column') ||
    combined.includes('has no column named') ||
    combined.includes('failed_login_attempts') ||
    combined.includes('locked_until') ||
    combined.includes('auth_refresh_sessions') ||
    combined.includes('token_blacklist') ||
    combined.includes('audit_logs')
  );
}

function isAuthPath(pathname: string) {
  return pathname.startsWith('/api/auth/') || pathname.startsWith('/api/v1/auth/');
}

function getSafeClientErrorMessage(pathname: string, error: ApiError) {
  if (!isAuthPath(pathname)) {
    return error.message;
  }

  if (pathname.includes('/forgot-password/')) {
    return 'Unable to complete this request. Please try again.';
  }

  if (pathname.endsWith('/login')) {
    return 'Unable to sign in. Please check your credentials and try again.';
  }

  if (pathname.endsWith('/refresh')) {
    return 'Your session could not be refreshed. Please sign in again.';
  }

  if (pathname.endsWith('/logout')) {
    return 'Unable to sign out right now. Please try again.';
  }

  return 'Unable to complete this authentication request.';
}

export function withApiHandler(
  handler: (request: Request, context: HandlerContext) => Promise<Response>,
  options?: HandlerOptions
) {
  return async function wrappedHandler(request: Request) {
    const requestId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
    const startedAt = performance.now();
    const pathname = new URL(request.url).pathname;

    try {
      const auth = await authenticateRequest(request, {
        required: options?.requireAuth,
        roles: options?.roles,
      });

      const response = await handler(request, { requestId, auth });
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      response.headers.set('x-correlation-id', requestId);

      logger.http('api_request_completed', {
        requestId,
        method: request.method,
        path: pathname,
        status: response.status,
        durationMs,
        userId: auth?.user.id ?? null,
      });

      return response;
    } catch (error) {
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

      if (error instanceof ZodError) {
        logger.warn('api_validation_failed', {
          requestId,
          method: request.method,
          path: pathname,
          durationMs,
          issues: error.issues,
        });

        return apiError('Validation failed', {
          status: 400,
          errors: error.issues,
          headers: { 'x-correlation-id': requestId },
        });
      }

      if (error instanceof ApiError) {
        logger.warn('api_request_failed', {
          requestId,
          method: request.method,
          path: pathname,
          durationMs,
          status: error.statusCode,
          code: error.code,
          details: error.details,
        });

        void logApplicationError({
          requestId,
          path: pathname,
          method: request.method,
          category: 'api_error',
          message: error.message,
          details: {
            statusCode: error.statusCode,
            code: error.code,
          },
        });

        return apiError(getSafeClientErrorMessage(pathname, error), {
          status: error.statusCode,
          errors: error.details,
          headers: { 'x-correlation-id': requestId },
        });
      }

      if (isSchemaMismatchError(error)) {
        const schemaError = new ServiceUnavailableError(
          'Database schema is out of date. Run `npm run migrate` and restart the app.'
        );

        logger.error('api_request_schema_mismatch', {
          requestId,
          method: request.method,
          path: pathname,
          durationMs,
          error: extractErrorMessages(error).join(' | ') || 'Unknown schema mismatch',
        });

        void logApplicationError({
          requestId,
          path: pathname,
          method: request.method,
          category: 'schema_mismatch',
          message: extractErrorMessages(error).join(' | ') || 'Unknown schema mismatch',
        });

        return apiError(schemaError.message, {
          status: schemaError.statusCode,
          headers: { 'x-correlation-id': requestId },
        });
      }

      logger.error('api_request_crashed', {
        requestId,
        method: request.method,
        path: pathname,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      void logApplicationError({
        requestId,
        path: pathname,
        method: request.method,
        category: 'unhandled_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });

      return apiError('Internal server error', {
        status: 500,
        headers: { 'x-correlation-id': requestId },
      });
    }
  };
}

export function paginatedMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total };
}
