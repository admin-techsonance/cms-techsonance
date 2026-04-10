import { getSupabaseAdminClient } from '@/server/supabase/admin';

export async function registerTenantAdmin(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId: string;
}) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      firstName: input.firstName,
      lastName: input.lastName,
    },
    app_metadata: {
      tenant_id: input.tenantId,
      role: 'SuperAdmin',
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function setTenantClaims(input: {
  authUserId: string;
  tenantId: string;
  role: string;
}) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.updateUserById(input.authUserId, {
    app_metadata: {
      tenant_id: input.tenantId,
      role: input.role,
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}
