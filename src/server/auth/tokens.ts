import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/server/config/env';
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER, type AppRole } from '@/server/auth/constants';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: AppRole;
  sessionId: string;
  tokenId: string;
}

export async function signAccessToken(claims: AccessTokenClaims) {
  return new SignJWT({
    email: claims.email,
    role: claims.role,
    sessionId: claims.sessionId,
    tokenId: claims.tokenId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setSubject(claims.sub)
    .setExpirationTime(`${env.AUTH_ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string) {
  return jwtVerify(token, accessSecret, {
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE,
  });
}

export function generateOpaqueToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateTokenId() {
  return crypto.randomUUID();
}

