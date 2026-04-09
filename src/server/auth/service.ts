import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { auditLogs, authRefreshSessions, users } from '@/db/schema';
import { env } from '@/server/config/env';
import { ConflictError, NotFoundError, UnauthorizedError } from '@/server/http/errors';
import { verifyPassword, hashPassword } from '@/server/auth/password';
import {
  blacklistAccessToken,
  clearRefreshTokenCookie,
  createRefreshSession,
  getAuthenticatedUserFromAccessToken,
  issueAccessToken,
  readRefreshTokenCookie,
  revokeRefreshSession,
  rotateRefreshSession,
  writeRefreshTokenCookie,
} from '@/server/auth/session';

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

export async function loginUser(input: {
  email: string;
  password: string;
  rememberMe?: boolean;
  request: Request;
  requestId?: string;
}) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('This account is inactive');
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new ConflictError('Account is temporarily locked due to repeated failed login attempts');
  }

  const passwordMatches = await verifyPassword(input.password, user.password);

  if (!passwordMatches) {
    const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const shouldLock = failedAttempts >= env.AUTH_LOCKOUT_ATTEMPTS;

    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : failedAttempts,
        lockedUntil: shouldLock ? getLockoutExpiryDate().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));

    throw new UnauthorizedError('Invalid email or password');
  }

  await db
    .update(users)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  const refreshSession = await createRefreshSession({
    userId: user.id,
    rememberMe: input.rememberMe ?? false,
    ...getRequestMetadata(input.request),
  });

  const access = await issueAccessToken(user, refreshSession.sessionId);
  await writeRefreshTokenCookie(refreshSession.refreshToken, {
    persistent: refreshSession.isPersistent,
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.login',
    resourceType: 'auth_session',
    resourceId: refreshSession.sessionId,
    request: input.request,
    requestId: input.requestId,
    details: { email: user.email },
  });

  return {
    accessToken: access.accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
    },
  };
}

export async function refreshUserSession(request: Request, requestId?: string) {
  const refreshToken = await readRefreshTokenCookie();

  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token is missing');
  }

  const rotated = await rotateRefreshSession(refreshToken, getRequestMetadata(request));
  const [user] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);

  if (!user || !user.isActive) {
    throw new UnauthorizedError();
  }

  const access = await issueAccessToken(user, rotated.sessionId);
  await writeRefreshTokenCookie(rotated.refreshToken, {
    persistent: rotated.isPersistent,
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.refresh',
    resourceType: 'auth_session',
    resourceId: rotated.sessionId,
    request,
    requestId,
  });

  return {
    accessToken: access.accessToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
    },
  };
}

export async function logoutUser(request: Request, requestId?: string) {
  const refreshToken = await readRefreshTokenCookie();
  const auth = await getAuthenticatedUserFromAccessToken(request).catch(() => null);

  if (auth) {
    const expiresAt = new Date(Date.now() + env.AUTH_ACCESS_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
    await blacklistAccessToken({
      tokenId: auth.tokenId,
      userId: auth.user.id,
      expiresAt,
      reason: 'logout',
    });
  }

  if (refreshToken) {
    await revokeRefreshSession(refreshToken);
  }

  await clearRefreshTokenCookie();

  if (auth) {
    await writeAuditLog({
      actorUserId: auth.user.id,
      action: 'auth.logout',
      resourceType: 'auth_session',
      resourceId: auth.sessionId,
      request,
      requestId,
    });
  }
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

  const [user] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const passwordMatches = await verifyPassword(input.currentPassword, user.password);

  if (!passwordMatches) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  if (await verifyPassword(input.newPassword, user.password)) {
    throw new ConflictError('New password must be different from the current password');
  }

  await db
    .update(users)
    .set({
      password: await hashPassword(input.newPassword),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(authRefreshSessions.userId, user.id), isNull(authRefreshSessions.revokedAt)));

  await clearRefreshTokenCookie();

  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.change_password',
    resourceType: 'user',
    resourceId: String(user.id),
    request: input.request,
    requestId: input.requestId,
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
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    method: input.request.method,
    path: new URL(input.request.url).pathname,
    correlationId: input.requestId ?? null,
    details: input.details ?? null,
    createdAt: new Date().toISOString(),
  });
}
