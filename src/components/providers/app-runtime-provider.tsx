'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { logClientEvent, reportClientError } from '@/lib/client-logger';
import {
  clearClientSession,
  getStoredUser,
  getStoredSessionToken,
  persistClientSession,
  reconcileEphemeralSession,
  shouldRememberSession,
} from '@/lib/client-session';

type Props = {
  children: React.ReactNode;
};

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  message?: string;
  errors?: unknown[] | null;
  meta?: Record<string, unknown>;
};

function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return Boolean(value && typeof value === 'object' && 'success' in value && 'message' in value);
}

function normalizeApiJson(payload: unknown) {
  if (!isApiEnvelope(payload)) {
    return payload;
  }

  if (payload.success === false) {
    return {
      error: payload.message,
      message: payload.message,
      errors: payload.errors ?? null,
      meta: payload.meta ?? null,
    };
  }

  if (Array.isArray(payload.data)) {
    return Object.assign(payload.data, {
      message: payload.message,
      meta: payload.meta ?? null,
    });
  }

  if (payload.data && typeof payload.data === 'object') {
    return {
      ...(payload.data as Record<string, unknown>),
      message: payload.message,
      meta: payload.meta ?? null,
    };
  }

  if (payload.data === null || payload.data === undefined) {
    return {
      message: payload.message,
      meta: payload.meta ?? null,
    };
  }

  return {
    data: payload.data,
    message: payload.message,
    meta: payload.meta ?? null,
  };
}

function isApiRoute(url: URL) {
  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

export function AppRuntimeProvider({ children }: Props) {
  const router = useRouter();

  useEffect(() => {
    reconcileEphemeralSession();

    const originalFetch = window.fetch.bind(window);
    let refreshPromise: Promise<string | null> | null = null;
    let authMePromise: Promise<{ status: number; payload: unknown } | null> | null = null;
    let authMeCache: { status: number; payload: unknown; cachedAt: number } | null = null;

    function createJsonResponse(status: number, payload: unknown) {
      return new Response(JSON.stringify(payload), {
        status,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    async function refreshAccessToken() {
      if (refreshPromise) return refreshPromise;

      refreshPromise = (async () => {
        try {
          const response = await originalFetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            clearClientSession();
            return null;
          }

          const payload = normalizeApiJson(await response.json()) as Record<string, unknown> | null;
          const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : null;
          if (accessToken) {
            persistClientSession({
              accessToken,
              user: payload?.user ?? getStoredUser(),
              rememberMe: shouldRememberSession(),
            });
          }
          return accessToken;
        } catch (error) {
          reportClientError(error, { action: 'refresh_access_token' });
          return null;
        } finally {
          refreshPromise = null;
        }
      })();

      return refreshPromise;
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, window.location.origin);
      const nextHeaders = new Headers(request.headers);
      const isSameApiRoute = isApiRoute(url);
      const isAuthRefresh = url.pathname === '/api/auth/refresh';
      const isAuthLogin = url.pathname === '/api/auth/login';
      const isForgotPasswordFlow = url.pathname.startsWith('/api/auth/forgot-password/');
      const isAuthMe = url.pathname === '/api/auth/me' && request.method.toUpperCase() === 'GET';
      const token = getStoredSessionToken();

      if (isSameApiRoute && token && !nextHeaders.has('Authorization') && !isAuthRefresh && !isAuthLogin) {
        nextHeaders.set('Authorization', `Bearer ${token}`);
      }

      const doFetch = () => originalFetch(input, {
        ...init,
        headers: nextHeaders,
        credentials: init?.credentials ?? 'include',
      });

      if (isSameApiRoute && isAuthMe) {
        if (authMeCache && Date.now() - authMeCache.cachedAt < 2000) {
          return createJsonResponse(authMeCache.status, authMeCache.payload);
        }

        if (authMePromise) {
          const cached = await authMePromise;
          if (cached) {
            return createJsonResponse(cached.status, cached.payload);
          }
        }
      }

      let response = await doFetch();

      if (isSameApiRoute && isAuthMe && response.headers.get('content-type')?.includes('application/json')) {
        authMePromise = response
          .clone()
          .json()
          .then((payload) => {
            authMeCache = {
              status: response.status,
              payload,
              cachedAt: Date.now(),
            };

            return {
              status: response.status,
              payload,
            };
          })
          .catch(() => null)
          .finally(() => {
            authMePromise = null;
          });
      }

      if (isSameApiRoute && response.status === 401 && token && !isAuthRefresh && !isAuthLogin) {
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          nextHeaders.set('Authorization', `Bearer ${refreshedToken}`);
          response = await doFetch();
        }
      }

      if (isSameApiRoute && response.status === 403) {
        toast.error('You no longer have access to this page. Please sign in again.');
        router.push('/login');
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const originalJson = response.json.bind(response);
        response.json = async () => normalizeApiJson(await originalJson());

        if (!response.ok) {
          response.clone().json()
            .then((payload) => {
              const normalized = normalizeApiJson(payload) as Record<string, unknown>;
              const message = typeof normalized?.error === 'string'
                ? normalized.error
                : typeof normalized?.message === 'string'
                  ? normalized.message
                  : 'Request failed';

              const safeMessage = isAuthLogin
                ? 'Unable to sign in. Please check your credentials and try again.'
                : isForgotPasswordFlow
                  ? 'Unable to complete this request right now. Please try again.'
                  : message;

              if (!isAuthRefresh && !isAuthLogin) {
                toast.error(safeMessage);
              }

              logClientEvent('warn', 'api_request_failed', {
                status: response.status,
                path: url.pathname,
                message: safeMessage,
              });
            })
            .catch(() => undefined);
        }
      }

      return response;
    };

    const handleUnhandledError = (event: ErrorEvent) => {
      reportClientError(event.error ?? event.message, { source: 'window.onerror' });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, { source: 'unhandledrejection' });
    };

    window.addEventListener('error', handleUnhandledError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('error', handleUnhandledError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [router]);

  return children;
}
