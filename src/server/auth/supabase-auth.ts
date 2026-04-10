import { ServiceUnavailableError, UnauthorizedError } from '@/server/http/errors';
import { getSupabaseServerClient } from '@/server/supabase/client';
import { isSupabaseConfigured } from '@/server/auth/provider';

function assertSupabaseAuthConfigured() {
  if (!isSupabaseConfigured()) {
    throw new ServiceUnavailableError('Supabase authentication is not configured');
  }
}

export async function signInWithSupabasePassword(input: {
  email: string;
  password: string;
}) {
  assertSupabaseAuthConfigured();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.session || !data.user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return data;
}

export async function refreshSupabaseSession(refreshToken: string) {
  assertSupabaseAuthConfigured();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    throw new UnauthorizedError('Refresh token is invalid or expired');
  }

  return data;
}

export async function getSupabaseUserFromAccessToken(accessToken: string) {
  assertSupabaseAuthConfigured();

  const supabase = getSupabaseServerClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new UnauthorizedError();
  }

  return data.user;
}

export async function signOutSupabaseSession(accessToken: string | null | undefined) {
  if (!accessToken || !isSupabaseConfigured()) {
    return;
  }

  const supabase = getSupabaseServerClient(accessToken);
  await supabase.auth.signOut().catch(() => undefined);
}

export async function updateSupabasePassword(input: {
  accessToken: string;
  password: string;
}) {
  assertSupabaseAuthConfigured();

  const supabase = getSupabaseServerClient(input.accessToken);
  const { error } = await supabase.auth.updateUser({
    password: input.password,
  });

  if (error) {
    throw new UnauthorizedError('Unable to update password');
  }
}
