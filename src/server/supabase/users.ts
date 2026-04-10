import { UnauthorizedError } from '@/server/http/errors';
import { getSupabaseServerClient } from '@/server/supabase/client';
import { getSupabaseUserFromAccessToken } from '@/server/auth/supabase-auth';
import { normalizeAppRole } from '@/server/auth/rbac';

export type SupabaseUserProfile = {
  id: string;
  legacy_user_id: number | null;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  failed_login_attempts?: number | null;
  locked_until?: string | null;
  last_login?: string | null;
};

function getClient(accessToken?: string | null) {
  return getSupabaseServerClient(accessToken) as any;
}

export async function getSupabaseProfileByAuthUserId(authUserId: string, accessToken?: string | null) {
  const supabase = getClient(accessToken);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUserId)
    .single();

  if (error || !data) {
    throw new UnauthorizedError();
  }

  return data as SupabaseUserProfile;
}

export async function getCurrentSupabaseProfile(accessToken: string) {
  const authUser = await getSupabaseUserFromAccessToken(accessToken);
  const profile = await getSupabaseProfileByAuthUserId(authUser.id, accessToken);

  return {
    authUserId: authUser.id,
    tenantId: profile.tenant_id,
    legacyUserId: profile.legacy_user_id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: normalizeAppRole(profile.role),
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    isActive: profile.is_active,
    raw: profile,
  };
}

export async function getSupabaseProfileByEmail(email: string, accessToken?: string | null) {
  const supabase = getClient(accessToken);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !data) {
    throw new UnauthorizedError();
  }

  return data as SupabaseUserProfile;
}

export async function getSupabaseProfileByLegacyUserId(legacyUserId: number, accessToken?: string | null) {
  const supabase = getClient(accessToken);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('legacy_user_id', legacyUserId)
    .single();

  if (error || !data) {
    throw new UnauthorizedError();
  }

  return data as SupabaseUserProfile;
}

export async function listSupabaseProfilesByAuthIds(authUserIds: string[], accessToken?: string | null) {
  if (!authUserIds.length) {
    return new Map<string, SupabaseUserProfile>();
  }

  const supabase = getClient(accessToken);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .in('id', authUserIds);

  if (error) {
    throw error;
  }

  return new Map<string, SupabaseUserProfile>(
    ((data as SupabaseUserProfile[] | null) ?? []).map((profile) => [profile.id, profile])
  );
}

export async function updateSupabaseProfileByAuthUserId(
  authUserId: string,
  payload: Record<string, unknown>,
  accessToken?: string | null
) {
  const supabase = getClient(accessToken);
  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', authUserId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new UnauthorizedError();
  }

  return data as SupabaseUserProfile;
}
