import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from '@/server/config/env';

const publicRoutes = ['/', '/login'];
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getRequestKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const hasAuth = Boolean(authHeader?.startsWith('Bearer ') || request.cookies.get('refresh_token'));
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwardedFor || 'unknown';
  return {
    bucket: `${hasAuth ? 'auth' : 'public'}:${ip}`,
    limit: hasAuth ? env.AUTH_RATE_LIMIT_PER_MINUTE : env.PUBLIC_RATE_LIMIT_PER_MINUTE,
  };
}

function applyRateLimit(request: NextRequest) {
  const now = Date.now();
  const { bucket, limit } = getRequestKey(request);
  const existing = rateLimitStore.get(bucket);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(bucket, { count: 1, resetAt: now + 60_000 });
    return null;
  }

  if (existing.count >= limit) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: 'Rate limit exceeded',
        errors: [{ code: 'RATE_LIMIT_EXCEEDED', limit }],
      },
      {
        status: 429,
        headers: {
          'retry-after': String(Math.ceil((existing.resetAt - now) / 1000)),
        },
      }
    );
  }

  existing.count += 1;
  rateLimitStore.set(bucket, existing);
  return null;
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-correlation-id', requestId);

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const limited = applyRateLimit(request);

    if (limited) {
      limited.headers.set('x-correlation-id', requestId);
      return limited;
    }
  }

  if (!request.nextUrl.pathname.startsWith('/api/') && isPublicRoute(request.nextUrl.pathname)) {
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    response.headers.set('x-correlation-id', requestId);
    response.headers.set('x-frame-options', 'DENY');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
    response.headers.set(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:; frame-ancestors 'none';"
    );
    return response;
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('x-correlation-id', requestId);
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set(
    'content-security-policy',
    "default-src 'self'; img-src 'self' data: https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https: http:; frame-ancestors 'none';"
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

