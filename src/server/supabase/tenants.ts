import { getSupabaseAdminClient } from '@/server/supabase/admin';
import { registerTenantAdmin } from '@/server/supabase/auth';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export async function registerTenant(input: {
  companyName: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
}) {
  const supabase = getSupabaseAdminClient() as any;

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name: input.companyName,
      slug: input.slug,
      status: 'active',
    })
    .select()
    .single();

  if (tenantError) {
    throw tenantError;
  }

  if (!tenant) {
    throw new Error('Failed to create tenant');
  }

  const typedTenant = tenant as TenantRow;

  const authUser = await registerTenantAdmin({
    email: input.adminEmail,
    password: input.adminPassword,
    firstName: input.adminFirstName,
    lastName: input.adminLastName,
    tenantId: typedTenant.id,
  });

  const { error: membershipError } = await supabase.from('tenant_users').insert({
    tenant_id: typedTenant.id,
    user_id: authUser.id,
    email: input.adminEmail,
    role: 'SuperAdmin',
    first_name: input.adminFirstName,
    last_name: input.adminLastName,
    status: 'active',
  });

  if (membershipError) {
    throw membershipError;
  }

  const { error: profileError } = await supabase.from('users').insert({
    id: authUser.id,
    tenant_id: typedTenant.id,
    email: input.adminEmail,
    first_name: input.adminFirstName,
    last_name: input.adminLastName,
    role: 'SuperAdmin',
    is_active: true,
  });

  if (profileError) {
    throw profileError;
  }

  return {
    tenant: typedTenant,
    authUserId: authUser.id,
  };
}
