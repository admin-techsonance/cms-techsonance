import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { companySettingsSchema, updateCompanySettingsSchema } from '@/server/validation/settings';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseCompanySettings(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    companyName: row.company_name,
    logoUrl: row.logo_url ?? null,
    primaryColor: row.primary_color ?? null,
    secondaryColor: row.secondary_color ?? null,
    email: row.email,
    phone: row.phone ?? null,
    address: row.address ?? null,
    website: row.website ?? null,
    smtpHost: row.smtp_host ?? null,
    smtpPort: row.smtp_port ?? null,
    smtpUser: row.smtp_user ?? null,
    smtpPassword: row.smtp_password ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (_request, context) => {
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  return apiSuccess(
    settings ? normalizeSupabaseCompanySettings(settings) : null,
    settings ? 'Company settings fetched successfully' : 'Company settings not configured'
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = companySettingsSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('company_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    throw new ConflictError('Company settings already exist. Use PUT to update the current record.');
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('company_settings').insert({
    company_name: payload.companyName.trim(),
    email: payload.email.toLowerCase().trim(),
    logo_url: payload.logoUrl?.trim() || null,
    primary_color: payload.primaryColor?.trim() || null,
    secondary_color: payload.secondaryColor?.trim() || null,
    phone: payload.phone?.trim() || null,
    address: payload.address?.trim() || null,
    website: payload.website?.trim() || null,
    smtp_host: payload.smtpHost?.trim() || null,
    smtp_port: payload.smtpPort ?? null,
    smtp_user: payload.smtpUser?.trim() || null,
    smtp_password: payload.smtpPassword ?? null,
    tenant_id: tenantId,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create company settings');
  return apiSuccess(normalizeSupabaseCompanySettings(created), 'Company settings created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const payload = updateCompanySettingsSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update company settings');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('company_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  if (!existing) {
    throw new NotFoundError('Company settings not found');
  }

  const { data: updated, error } = await supabase.from('company_settings').update({
    ...(payload.companyName !== undefined ? { company_name: payload.companyName.trim() } : {}),
    ...(payload.email !== undefined ? { email: payload.email?.toLowerCase().trim() || null } : {}),
    ...(payload.logoUrl !== undefined ? { logo_url: payload.logoUrl?.trim() || null } : {}),
    ...(payload.primaryColor !== undefined ? { primary_color: payload.primaryColor?.trim() || null } : {}),
    ...(payload.secondaryColor !== undefined ? { secondary_color: payload.secondary_color?.trim() || null } : {}),
    ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
    ...(payload.address !== undefined ? { address: payload.address?.trim() || null } : {}),
    ...(payload.website !== undefined ? { website: payload.website?.trim() || null } : {}),
    ...(payload.smtpHost !== undefined ? { smtp_host: payload.smtpHost?.trim() || null } : {}),
    ...(payload.smtpPort !== undefined ? { smtp_port: payload.smtpPort ?? null } : {}),
    ...(payload.smtpUser !== undefined ? { smtp_user: payload.smtpUser?.trim() || null } : {}),
    ...(payload.smtpPassword !== undefined ? { smtp_password: payload.smtpPassword ?? null } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', existing.id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update company settings');
  return apiSuccess(normalizeSupabaseCompanySettings(updated), 'Company settings updated successfully');
}, { requireAuth: true, roles: ['Admin'] });
