import { cookies } from 'next/headers';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { authRefreshSessions, tokenBlacklist, users } from '@/db/schema';
import { REFRESH_COOKIE_NAME, type AppRole } from '@/server/auth/constants';
import { env } from '@/server/config/env';
import { UnauthorizedError } from '@/server/http/errors';
import { hashToken, generateOpaqueToken, generateTokenId, signAccessToken, verifyAccessToken } from '@/server/auth/tokens';
import { normalizeAppRole, requireRole } from '@/server/auth/rbac';

export interface AuthenticatedUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AppRole;
  avatarUrl: string | null;
  phone: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  accessToken: string;
  tokenId: string;
  sessionId: string;
}

function getRefreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + env.AUTH_REFRESH_TOKEN_TTL_DAYS);
  return date;
}

export async function createRefreshSession(input: {
  userId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  rememberMe?: boolean;
}) {
  const rawRefreshToken = generateOpaqueToken();
  const refreshTokenHash = hashToken(rawRefreshToken);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = getRefreshExpiryDate().toISOString();

  await db.insert(authRefreshSessions).values({
    id,
    userId: input.userId,
    refreshTokenHash,
    isPersistent: input.rememberMe ?? false,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    expiresAt,
    createdAt: now,
    lastUsedAt: now,
  });

  return {
    sessionId: id,
    refreshToken: rawRefreshToken,
    expiresAt,
    isPersistent: input.rememberMe ?? false,
  };
}

export async function rotateRefreshSession(rawRefreshToken: string, metadata?: { ipAddress?: string | null; userAgent?: string | null }) {
  const now = new Date().toISOString();
  const refreshTokenHash = hashToken(rawRefreshToken);

  const [session] = await db
    .select()
    .from(authRefreshSessions)
    .where(and(eq(authRefreshSessions.refreshTokenHash, refreshTokenHash), isNull(authRefreshSessions.revokedAt)))
    .limit(1);

  if (!session || new Date(session.expiresAt) <= new Date()) {
    throw new UnauthorizedError('Refresh token is invalid or expired');
  }

  const nextRefreshToken = generateOpaqueToken();
  const nextRefreshTokenHash = hashToken(nextRefreshToken);

  await db
    .update(authRefreshSessions)
    .set({
      refreshTokenHash: nextRefreshTokenHash,
      rotatedAt: now,
      lastUsedAt: now,
      ipAddress: metadata?.ipAddress ?? session.ipAddress,
      userAgent: metadata?.userAgent ?? session.userAgent,
      expiresAt: getRefreshExpiryDate().toISOString(),
    })
    .where(eq(authRefreshSessions.id, session.id));

  return {
    sessionId: session.id,
    userId: session.userId,
    refreshToken: nextRefreshToken,
    isPersistent: session.isPersistent,
  };
}

export async function revokeRefreshSession(rawRefreshToken: string | null | undefined) {
  if (!rawRefreshToken) {
    return;
  }

  await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(authRefreshSessions.refreshTokenHash, hashToken(rawRefreshToken)));
}

export async function blacklistAccessToken(input: {
  tokenId: string;
  userId?: number | null;
  expiresAt: string;
  reason: string;
}) {
  await db.insert(tokenBlacklist).values({
    id: crypto.randomUUID(),
    tokenId: input.tokenId,
    userId: input.userId ?? null,
    expiresAt: input.expiresAt,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

export async function isTokenBlacklisted(tokenId: string) {
  const [blocked] = await db.select().from(tokenBlacklist).where(eq(tokenBlacklist.tokenId, tokenId)).limit(1);
  return Boolean(blocked && new Date(blocked.expiresAt) > new Date());
}

export async function issueAccessToken(user: {
  id: number;
  email: string;
  role: string;
}, sessionId = crypto.randomUUID()) {
  const tokenId = generateTokenId();
  const accessToken = await signAccessToken({
    sub: String(user.id),
    email: user.email,
    role: normalizeAppRole(user.role),
    sessionId,
    tokenId,
  });

  return {
    accessToken,
    sessionId,
    tokenId,
  };
}

export async function authenticateRequest(request: Request, options?: { required?: boolean; roles?: AppRole[] }) {
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!bearerToken) {
    if (options?.required) {
      throw new UnauthorizedError();
    }

    return null;
  }

  const verification = await verifyAccessToken(bearerToken);
  const tokenId = String(verification.payload.tokenId);

  if (await isTokenBlacklisted(tokenId)) {
    throw new UnauthorizedError('Access token has been revoked');
  }

  const userId = Number(verification.payload.sub);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      avatarUrl: users.avatarUrl,
      phone: users.phone,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new UnauthorizedError();
  }

  const authContext: AuthContext = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: normalizeAppRole(user.role),
      avatarUrl: user.avatarUrl,
      phone: user.phone,
    },
    accessToken: bearerToken,
    tokenId,
    sessionId: String(verification.payload.sessionId),
  };

  if (options?.roles?.length) {
    requireRole(authContext.user.role, options.roles);
  }

  return authContext;
}

export async function readRefreshTokenCookie() {
  return (await cookies()).get(REFRESH_COOKIE_NAME)?.value ?? null;
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
}

export async function getAuthenticatedUserFromAccessToken(request: Request, allowedRoles?: AppRole[]) {
  return authenticateRequest(request, { required: true, roles: allowedRoles });
}
