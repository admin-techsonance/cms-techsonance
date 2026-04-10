import { env } from '@/server/config/env';
import { ConflictError, NotFoundError, UnauthorizedError } from '@/server/http/errors';
import { logAuthEvent } from '@/server/logging/mongo-log';
import {
  clearRefreshTokenCookie,
  getAuthenticatedUserFromAccessToken,
  readRefreshTokenCookie,
  readRefreshTokenPersistenceCookie,
  writeRefreshTokenCookie,
} from '@/server/auth/session';
import {
  refreshSupabaseSession,
  signInWithSupabasePassword,
  signOutSupabaseSession,
  updateSupabasePassword,
} from '@/server/auth/supabase-auth';
import {
  getCurrentSupabaseProfile,
  getSupabaseProfileByEmail,
  getSupabaseProfileByLegacyUserId,
  updateSupabaseProfileByAuthUserId,
} from '@/server/supabase/users';
import { getSupabaseAdminClient } from '@/server/supabase/admin';

function getLockoutExpiryDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + env.AUTH_LOCKOUT_MINUTES);
  return date;
}

function getRequestMetadata(request: Request) {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  };
}

async function writeAuthTelemetry(input: {
  action: string;
  request: Request;
  requestId?: string;
  userId?: number | null;
  email?: string | null;
  status?: string;
  details?: Record<string, unknown>;
}) {
  const metadata = getRequestMetadata(input.request);
  await logAuthEvent({
    action: input.action,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    email: input.email ?? null,
    path: new URL(input.request.url).pathname,
    status: input.status ?? 'unknown',
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    details: input.details ?? null,
  });
}

export async function writeAuditLog(input: {
  actorUserId?: number | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  request: Request;
  requestId?: string;
  details?: Record<string, unknown>;
}) {
  const admin = getSupabaseAdminClient() as any;
  let actor: { id: string; tenant_id: string } | null = null;

  if (typeof input.actorUserId === 'number') {
    const { data } = await admin
      .from('users')
      .select('id, tenant_id')
      .eq('legacy_user_id', input.actorUserId)
      .maybeSingle();
    actor = data ?? null;
  }

  if (!actor) {
    return;
  }

  await admin.from('audit_logs').insert({
    tenant_id: actor.tenant_id,
    actor_user_id: actor.id,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    method: input.request.method,
    path: new URL(input.request.url).pathname,
    correlation_id: input.requestId ?? null,
    details: input.details ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
  request: Request;
  requestId?: string;
}) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await getSupabaseProfileByEmail(normalizedEmail).catch(() => null);

  if (!user) {
    await writeAuthTelemetry({
      action: 'auth.login',
      request: input.request,
      requestId: input.requestId,
      email: normalizedEmail,
      status: 'failed',
      details: { reason: 'user_not_found', provider: 'supabase' },
    });
    throw new UnauthorizedError('Invalid email or password');
  }

  const userId = user.legacy_user_id;

  if (!user.is_active) {
    await writeAuthTelemetry({
      action: 'auth.login',
      request: input.request,
      requestId: input.requestId,
      userId,
      email: user.email,
      status: 'failed',
      details: { reason: 'inactive_account', provider: 'supabase' },
    });
    throw new UnauthorizedError('This account is inactive');
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await writeAuthTelemetry({
      action: 'auth.login',
      request: input.request,
      requestId: input.requestId,
      userId,
      email: user.email,
      status: 'locked',
      details: { lockedUntil: user.locked_until, provider: 'supabase' },
    });
    throw new ConflictError('Account is temporarily locked due to repeated failed login attempts');
  }

  try {
    const authData = await signInWithSupabasePassword({
      email: normalizedEmail,
      password: input.password,
    });

    await updateSupabaseProfileByAuthUserId(authData.user.id, {
      failed_login_attempts: 0,
      locked_until: null,
      last_login: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await writeRefreshTokenCookie(authData.session.refresh_token, {
      persistent: input.rememberMe ?? false,
    });

    await writeAuditLog({
      actorUserId: userId,
      action: 'auth.login',
      resourceType: 'auth_session',
      resourceId: authData.user.id,
      request: input.request,
      requestId: input.requestId,
      details: { email: user.email, provider: 'supabase' },
    });

    await writeAuthTelemetry({
      action: 'auth.login',
      request: input.request,
      requestId: input.requestId,
      userId,
      email: user.email,
      status: 'success',
      details: {
        rememberMe: input.rememberMe ?? false,
        provider: 'supabase',
      },
    });

    return {
      accessToken: authData.session.access_token,
      user: {
        id: userId ?? 0,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        phone: user.phone,
      },
    };
  } catch (error) {
    const failedAttempts = (user.failed_login_attempts ?? 0) + 1;
    const shouldLock = failedAttempts >= env.AUTH_LOCKOUT_ATTEMPTS;
    const nextLockedUntil = shouldLock ? getLockoutExpiryDate().toISOString() : null;

    await updateSupabaseProfileByAuthUserId(user.id, {
      failed_login_attempts: shouldLock ? 0 : failedAttempts,
      locked_until: nextLockedUntil,
      updated_at: new Date().toISOString(),
    }).catch(() => undefined);

    await writeAuthTelemetry({
      action: 'auth.login',
      request: input.request,
      requestId: input.requestId,
      userId,
      email: user.email,
      status: shouldLock ? 'locked' : 'failed',
      details: {
        failedAttempts,
        lockedUntil: nextLockedUntil,
        provider: 'supabase',
      },
    });

    throw error instanceof UnauthorizedError
      ? error
      : new UnauthorizedError('Invalid email or password');
  }
}

export async function refreshUserSession(request: Request, requestId?: string) {
  const refreshToken = await readRefreshTokenCookie();
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is missing');
  }

  const persistent = await readRefreshTokenPersistenceCookie();
  const authData = await refreshSupabaseSession(refreshToken);
  const session = authData.session;
  if (!session) {
    throw new UnauthorizedError();
  }

  const supabaseProfile = await getCurrentSupabaseProfile(session.access_token);
  if (!supabaseProfile.isActive || supabaseProfile.legacyUserId === null) {
    throw new UnauthorizedError();
  }

  await writeRefreshTokenCookie(session.refresh_token, { persistent });

  await writeAuditLog({
    actorUserId: supabaseProfile.legacyUserId,
    action: 'auth.refresh',
    resourceType: 'auth_session',
    resourceId: supabaseProfile.authUserId,
    request,
    requestId,
    details: { provider: 'supabase' },
  });

  await writeAuthTelemetry({
    action: 'auth.refresh',
    request,
    requestId,
    userId: supabaseProfile.legacyUserId,
    email: supabaseProfile.email,
    status: 'success',
    details: { provider: 'supabase' },
  });

  return {
    accessToken: session.access_token,
    user: {
      id: supabaseProfile.legacyUserId,
      email: supabaseProfile.email,
      firstName: supabaseProfile.firstName,
      lastName: supabaseProfile.lastName,
      role: supabaseProfile.raw.role,
      avatarUrl: supabaseProfile.avatarUrl,
      phone: supabaseProfile.phone,
    },
  };
}

export async function logoutUser(request: Request, requestId?: string) {
  const auth = await getAuthenticatedUserFromAccessToken(request).catch(() => null);
  await signOutSupabaseSession(auth?.accessToken ?? null);
  await clearRefreshTokenCookie();

  if (!auth) {
    return;
  }

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: 'auth.logout',
    resourceType: 'auth_session',
    resourceId: auth.sessionId,
    request,
    requestId,
    details: { provider: 'supabase' },
  });

  await writeAuthTelemetry({
    action: 'auth.logout',
    request,
    requestId,
    userId: auth.user.id,
    email: auth.user.email,
    status: 'success',
    details: { provider: 'supabase' },
  });
}

export async function changeUserPassword(input: {
  request: Request;
  currentPassword: string;
  newPassword: string;
  requestId?: string;
}) {
  const auth = await getAuthenticatedUserFromAccessToken(input.request);
  if (!auth) {
    throw new UnauthorizedError();
  }

  const user = await getSupabaseProfileByLegacyUserId(auth.user.id).catch(() => null);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (input.currentPassword === input.newPassword) {
    throw new ConflictError('New password must be different from the current password');
  }

  await signInWithSupabasePassword({
    email: user.email,
    password: input.currentPassword,
  });

  await updateSupabasePassword({
    accessToken: auth.accessToken,
    password: input.newPassword,
  });

  await clearRefreshTokenCookie();

  await writeAuditLog({
    actorUserId: auth.user.id,
    action: 'auth.change_password',
    resourceType: 'user',
    resourceId: String(auth.user.id),
    request: input.request,
    requestId: input.requestId,
    details: { provider: 'supabase' },
  });

  await writeAuthTelemetry({
    action: 'auth.change_password',
    request: input.request,
    requestId: input.requestId,
    userId: auth.user.id,
    email: user.email,
    status: 'success',
    details: { provider: 'supabase' },
  });
}
