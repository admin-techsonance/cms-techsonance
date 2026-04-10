import { cookies } from 'next/headers';
import { REFRESH_COOKIE_NAME, type AppRole } from '@/server/auth/constants';
import { env } from '@/server/config/env';
import { UnauthorizedError } from '@/server/http/errors';
import { normalizeAppRole, requireRole } from '@/server/auth/rbac';
import { getSupabaseUserFromAccessToken } from '@/server/auth/supabase-auth';
import { getSupabaseProfileByAuthUserId } from '@/server/supabase/users';

export interface AuthenticatedUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  avatarUrl: string | null;
  phone: string | null;
  providerUserId?: string | null;
  tenantId?: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  accessToken: string;
  tokenId: string;
  sessionId: string;
}

const REFRESH_PERSISTENT_COOKIE_NAME = 'refresh_token_persistent';

function getRefreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + env.AUTH_REFRESH_TOKEN_TTL_DAYS);
  return date;
}

export async function authenticateRequest(request: Request, options?: { required?: boolean; roles?: AppRole[] }) {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!bearerToken) {
    if (options?.required) throw new UnauthorizedError();
    return null;
  }

  const supabaseUser = await getSupabaseUserFromAccessToken(bearerToken);
  const profile = await getSupabaseProfileByAuthUserId(supabaseUser.id, bearerToken);

  if (!profile.is_active || profile.legacy_user_id === null) {
    throw new UnauthorizedError();
  }

  const authContext: AuthContext = {
    user: {
      id: profile.legacy_user_id,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      role: normalizeAppRole(profile.role),
      avatarUrl: profile.avatar_url,
      phone: profile.phone,
      providerUserId: profile.id,
      tenantId: profile.tenant_id,
    },
    accessToken: bearerToken,
    tokenId: supabaseUser.id,
    sessionId: supabaseUser.id,
  };

  if (options?.roles?.length) {
    requireRole(authContext.user.role, options.roles);
  }

  return authContext;
}

export async function readRefreshTokenCookie() {
  return (await cookies()).get(REFRESH_COOKIE_NAME)?.value ?? null;
}

export async function readRefreshTokenPersistenceCookie() {
  return (await cookies()).get(REFRESH_PERSISTENT_COOKIE_NAME)?.value === 'true';
}

export async function writeRefreshTokenCookie(token: string, options?: { persistent?: boolean }) {
  const cookieStore = await cookies();
  const persistent = options?.persistent ?? true;
  cookieStore.set(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(persistent ? { expires: getRefreshExpiryDate() } : {}),
  });
  cookieStore.set(REFRESH_PERSISTENT_COOKIE_NAME, persistent ? 'true' : 'false', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(persistent ? { expires: getRefreshExpiryDate() } : {}),
  });
}

export async function clearRefreshTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.set(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  cookieStore.set(REFRESH_PERSISTENT_COOKIE_NAME, '', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

export async function getAuthenticatedUserFromAccessToken(request: Request, allowedRoles?: AppRole[]) {
  return authenticateRequest(request, { required: true, roles: allowedRoles });
}
