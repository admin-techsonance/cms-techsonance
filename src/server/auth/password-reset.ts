import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { authRefreshSessions, passwordResetOtps, users } from '@/db/schema';
import { hashPassword } from '@/server/auth/password';
import { env } from '@/server/config/env';
import { BadRequestError, UnauthorizedError } from '@/server/http/errors';
import { sendPasswordResetOtpEmail } from '@/server/mail/password-reset';
import { logAuthEvent } from '@/server/logging/mongo-log';

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(email: string, otp: string) {
  return crypto.createHash('sha256').update(`${email.toLowerCase().trim()}:${otp}`).digest('hex');
}

function getOtpExpiryDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + env.PASSWORD_RESET_OTP_TTL_MINUTES);
  return date;
}

async function getLatestResetRequest(email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const [record] = await db
    .select()
    .from(passwordResetOtps)
    .where(and(eq(passwordResetOtps.email, normalizedEmail), isNull(passwordResetOtps.consumedAt)))
    .orderBy(desc(passwordResetOtps.createdAt))
    .limit(1);

  return record ?? null;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user || !user.isActive) {
    await logAuthEvent({
      action: 'auth.password_reset.request',
      email: normalizedEmail,
      status: 'accepted',
      details: { userExists: false },
    });
    return {
      accepted: true,
      message: 'If the email exists, a password reset OTP has been sent.',
    };
  }

  await db
    .update(passwordResetOtps)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(eq(passwordResetOtps.userId, user.id), isNull(passwordResetOtps.consumedAt)));

  const otp = generateOtp();
  const now = new Date().toISOString();

  await db.insert(passwordResetOtps).values({
    id: crypto.randomUUID(),
    userId: user.id,
    email: normalizedEmail,
    otpHash: hashOtp(normalizedEmail, otp),
    expiresAt: getOtpExpiryDate().toISOString(),
    createdAt: now,
    attempts: 0,
  });

  await sendPasswordResetOtpEmail({
    email: normalizedEmail,
    firstName: user.firstName,
    otp,
  });

  await logAuthEvent({
    action: 'auth.password_reset.request',
    userId: user.id,
    email: normalizedEmail,
    status: 'accepted',
    details: { userExists: true },
  });

  return {
    accepted: true,
    message: 'If the email exists, a password reset OTP has been sent.',
  };
}

export async function verifyPasswordResetOtp(input: { email: string; otp: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const latest = await getLatestResetRequest(normalizedEmail);

  if (!latest || new Date(latest.expiresAt) <= new Date()) {
    await logAuthEvent({
      action: 'auth.password_reset.verify',
      email: normalizedEmail,
      userId: latest?.userId ?? null,
      status: 'failed',
      details: { reason: 'expired_or_missing' },
    });
    throw new UnauthorizedError('OTP is invalid or expired');
  }

  const expectedHash = hashOtp(normalizedEmail, input.otp);

  if (latest.otpHash !== expectedHash) {
    await db
      .update(passwordResetOtps)
      .set({ attempts: (latest.attempts ?? 0) + 1 })
      .where(eq(passwordResetOtps.id, latest.id));

    await logAuthEvent({
      action: 'auth.password_reset.verify',
      email: normalizedEmail,
      userId: latest.userId,
      status: 'failed',
      details: { reason: 'invalid_otp' },
    });

    throw new UnauthorizedError('OTP is invalid or expired');
  }

  await db
    .update(passwordResetOtps)
    .set({ verifiedAt: new Date().toISOString() })
    .where(eq(passwordResetOtps.id, latest.id));

  await logAuthEvent({
    action: 'auth.password_reset.verify',
    email: normalizedEmail,
    userId: latest.userId,
    status: 'success',
  });

  return {
    verified: true,
    message: 'OTP verified successfully',
  };
}

export async function resetPasswordWithOtp(input: {
  email: string;
  otp: string;
  newPassword: string;
}) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const latest = await getLatestResetRequest(normalizedEmail);

  if (!latest || new Date(latest.expiresAt) <= new Date() || !latest.verifiedAt) {
    await logAuthEvent({
      action: 'auth.password_reset.complete',
      email: normalizedEmail,
      userId: latest?.userId ?? null,
      status: 'failed',
      details: { reason: 'not_verified_or_expired' },
    });
    throw new UnauthorizedError('OTP verification is required before resetting the password');
  }

  if (latest.otpHash !== hashOtp(normalizedEmail, input.otp)) {
    await logAuthEvent({
      action: 'auth.password_reset.complete',
      email: normalizedEmail,
      userId: latest.userId,
      status: 'failed',
      details: { reason: 'invalid_otp' },
    });
    throw new UnauthorizedError('OTP is invalid or expired');
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, latest.userId))
    .limit(1);

  if (!user) {
    throw new BadRequestError('User account not found');
  }

  await db
    .update(users)
    .set({
      password: await hashPassword(input.newPassword),
      updatedAt: new Date().toISOString(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, user.id));

  await db
    .update(passwordResetOtps)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(eq(passwordResetOtps.userId, user.id), isNull(passwordResetOtps.consumedAt)));

  await db
    .update(authRefreshSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(authRefreshSessions.userId, user.id), isNull(authRefreshSessions.revokedAt)));

  await logAuthEvent({
    action: 'auth.password_reset.complete',
    email: normalizedEmail,
    userId: user.id,
    status: 'success',
  });

  return {
    success: true,
    message: 'Password reset successful',
  };
}
