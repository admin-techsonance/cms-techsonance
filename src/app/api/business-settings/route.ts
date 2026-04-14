import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { businessSettingsSchema } from '@/server/validation/settings';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseBusinessSettings(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    businessName: row.business_name,
    email: row.email ?? null,
    phone: row.contact_number ?? null,
    address: row.address ?? null,
    gstNo: row.gst_no ?? null,
    pan: row.pan ?? null,
    tan: row.tan ?? null,
    registrationNo: row.registration_no ?? null,
    termsAndConditions: row.terms_and_conditions ?? null,
    notes: row.notes ?? null,
    paymentTerms: row.payment_terms ?? null,
    logoUrl: row.logo_url ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (_request, context) => {
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: settings } = await supabase
    .from('business_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  return apiSuccess(
    settings ? normalizeSupabaseBusinessSettings(settings) : null,
    settings ? 'Business settings fetched successfully' : 'Business settings not configured'
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = businessSettingsSchema.parse(await request.json());
  const now = new Date().toISOString();

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('business_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase.from('business_settings').update({
      business_name: payload.businessName.trim(),
      email: payload.email?.toLowerCase().trim() || null,
      contact_number: payload.phone?.trim() || null,
      address: payload.address?.trim() || null,
      gst_no: payload.gstNo?.trim() || null,
      pan: payload.pan?.trim() || null,
      tan: payload.tan?.trim() || null,
      registration_no: payload.registrationNo?.trim() || null,
      terms_and_conditions: payload.termsAndConditions?.trim() || null,
      notes: payload.notes?.trim() || null,
      payment_terms: payload.paymentTerms?.trim() || null,
      logo_url: payload.logoUrl?.trim() || null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    if (error || !updated) throw error ?? new Error('Failed to update business settings');
    return apiSuccess(normalizeSupabaseBusinessSettings(updated), 'Business settings updated successfully');
  }

  const { data: created, error } = await supabase.from('business_settings').insert({
    business_name: payload.businessName.trim(),
    email: payload.email?.toLowerCase().trim() || null,
    contact_number: payload.phone?.trim() || null,
    address: payload.address?.trim() || null,
    gst_no: payload.gstNo?.trim() || null,
    pan: payload.pan?.trim() || null,
    tan: payload.tan?.trim() || null,
    registration_no: payload.registrationNo?.trim() || null,
    terms_and_conditions: payload.termsAndConditions?.trim() || null,
    notes: payload.notes?.trim() || null,
    payment_terms: payload.paymentTerms?.trim() || null,
    logo_url: payload.logoUrl?.trim() || null,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create business settings');
  return apiSuccess(normalizeSupabaseBusinessSettings(created), 'Business settings created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const payload = businessSettingsSchema.partial().parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update business settings');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('business_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();
  if (!existing) {
    throw new NotFoundError('Business settings not found');
  }

  const { data: updated, error } = await supabase.from('business_settings').update({
    ...(payload.businessName !== undefined ? { business_name: payload.businessName.trim() } : {}),
    ...(payload.email !== undefined ? { email: payload.email?.toLowerCase().trim() || null } : {}),
    ...(payload.phone !== undefined ? { contact_number: payload.phone?.trim() || null } : {}),
    ...(payload.address !== undefined ? { address: payload.address?.trim() || null } : {}),
    ...(payload.gstNo !== undefined ? { gst_no: payload.gstNo?.trim() || null } : {}),
    ...(payload.pan !== undefined ? { pan: payload.pan?.trim() || null } : {}),
    ...(payload.tan !== undefined ? { tan: payload.tan?.trim() || null } : {}),
    ...(payload.registrationNo !== undefined ? { registration_no: payload.registrationNo?.trim() || null } : {}),
    ...(payload.termsAndConditions !== undefined ? { terms_and_conditions: payload.termsAndConditions?.trim() || null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes?.trim() || null } : {}),
    ...(payload.paymentTerms !== undefined ? { payment_terms: payload.paymentTerms?.trim() || null } : {}),
    ...(payload.logoUrl !== undefined ? { logo_url: payload.logoUrl?.trim() || null } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', existing.id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update business settings');
  return apiSuccess(normalizeSupabaseBusinessSettings(updated), 'Business settings updated successfully');
}, { requireAuth: true, roles: ['Admin'] });
