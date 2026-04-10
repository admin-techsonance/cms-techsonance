import crypto from 'node:crypto';
import { env } from '@/server/config/env';
import { BadRequestError, UnauthorizedError } from '@/server/http/errors';
import { sendPasswordResetOtpEmail } from '@/server/mail/password-reset';
import { logAuthEvent } from '@/server/logging/mongo-log';
import { getSupabaseAdminClient } from '@/server/supabase/admin';

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
  const supabase = getSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from('password_reset_otps')
    .select('*')
    .eq('email', normalizedEmail)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const supabase = getSupabaseAdminClient() as any;

  const { data: user } = await supabase
    .from('users')
    .select('id, tenant_id, legacy_user_id, email, first_name, is_active')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!user || !user.is_active) {
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

  await supabase
    .from('password_reset_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('consumed_at', null);

  const otp = generateOtp();
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from('password_reset_otps').insert({
    tenant_id: user.tenant_id,
    user_id: user.id,
    email: normalizedEmail,
    otp_hash: hashOtp(normalizedEmail, otp),
    expires_at: getOtpExpiryDate().toISOString(),
    created_at: now,
    attempts: 0,
  });
  if (insertError) throw insertError;

  await sendPasswordResetOtpEmail({
    email: normalizedEmail,
    firstName: user.first_name,
    otp,
  });

  await logAuthEvent({
    action: 'auth.password_reset.request',
    userId: user.legacy_user_id,
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
  const supabase = getSupabaseAdminClient() as any;

  if (!latest || new Date(latest.expires_at) <= new Date()) {
    await logAuthEvent({
      action: 'auth.password_reset.verify',
      email: normalizedEmail,
      userId: null,
      status: 'failed',
      details: { reason: 'expired_or_missing' },
    });
    throw new UnauthorizedError('OTP is invalid or expired');
  }

  const expectedHash = hashOtp(normalizedEmail, input.otp);
  if (latest.otp_hash !== expectedHash) {
    await supabase
      .from('password_reset_otps')
      .update({ attempts: Number(latest.attempts ?? 0) + 1 })
      .eq('id', latest.id);

    await logAuthEvent({
      action: 'auth.password_reset.verify',
      email: normalizedEmail,
      userId: null,
      status: 'failed',
      details: { reason: 'invalid_otp' },
    });

    throw new UnauthorizedError('OTP is invalid or expired');
  }

  await supabase
    .from('password_reset_otps')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', latest.id);

  await logAuthEvent({
    action: 'auth.password_reset.verify',
    email: normalizedEmail,
    userId: null,
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
  const supabase = getSupabaseAdminClient() as any;

  if (!latest || new Date(latest.expires_at) <= new Date() || !latest.verified_at) {
    await logAuthEvent({
      action: 'auth.password_reset.complete',
      email: normalizedEmail,
      userId: null,
      status: 'failed',
      details: { reason: 'not_verified_or_expired' },
    });
    throw new UnauthorizedError('OTP verification is required before resetting the password');
  }

  if (latest.otp_hash !== hashOtp(normalizedEmail, input.otp)) {
    await logAuthEvent({
      action: 'auth.password_reset.complete',
      email: normalizedEmail,
      userId: null,
      status: 'failed',
      details: { reason: 'invalid_otp' },
    });
    throw new UnauthorizedError('OTP is invalid or expired');
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, legacy_user_id, email')
    .eq('id', latest.user_id)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) {
    throw new BadRequestError('User account not found');
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
    password: input.newPassword,
    app_metadata: undefined,
    user_metadata: undefined,
  });
  if (authError) {
    throw authError;
  }

  const { error: profileError } = await supabase
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (profileError) throw profileError;

  await supabase
    .from('password_reset_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('consumed_at', null);

  await logAuthEvent({
    action: 'auth.password_reset.complete',
    email: normalizedEmail,
    userId: user.legacy_user_id,
    status: 'success',
  });

  return {
    success: true,
    message: 'Password reset successful',
  };
}
