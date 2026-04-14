import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { companyHolidaySchema, updateCompanyHolidaySchema } from '@/server/validation/settings';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseCompanyHoliday(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    date: row.date,
    reason: row.reason,
    year: Number(row.year),
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();

  if (id) {
    const holidayId = Number(id);
    if (!Number.isInteger(holidayId) || holidayId <= 0) {
      throw new BadRequestError('Valid company holiday id is required');
    }

    const { data: holiday, error } = await supabase
      .from('company_holidays')
      .select('*')
      .eq('id', holidayId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !holiday) throw new NotFoundError('Company holiday not found');
    return apiSuccess(normalizeSupabaseCompanyHoliday(holiday), 'Company holiday fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const year = searchParams.get('year');
  let query = supabase
    .from('company_holidays')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (year !== null) {
    const parsedYear = Number(year);
    if (!Number.isInteger(parsedYear) || parsedYear < 1000 || parsedYear > 9999) {
      throw new BadRequestError('Year must be a valid 4-digit number');
    }
    query = query.eq('year', parsedYear);
  }

  const { data, count, error } = await query
    .order('date', { ascending: searchParams.get('order') !== 'desc' })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return apiSuccess(
    ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseCompanyHoliday),
    'Company holidays fetched successfully',
    { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = companyHolidaySchema.parse(await request.json());
  const year = payload.year ?? Number(payload.date.slice(0, 4));

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('company_holidays')
    .select('id')
    .eq('date', payload.date)
    .eq('tenant_id', tenantId)
    .single();
  if (existing) {
    throw new ConflictError('A company holiday already exists for that date');
  }

  const { data: created, error } = await supabase.from('company_holidays').insert({
    date: payload.date,
    reason: payload.reason.trim(),
    year,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create company holiday');
  return apiSuccess(normalizeSupabaseCompanyHoliday(created), 'Company holiday created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  const payload = updateCompanyHolidaySchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a company holiday');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('company_holidays')
    .select('*')
    .eq('id', holidayId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) {
    throw new NotFoundError('Company holiday not found');
  }

  const nextDate = payload.date ?? String(existing.date);
  const { data: duplicate } = await supabase
    .from('company_holidays')
    .select('id')
    .eq('date', nextDate)
    .eq('tenant_id', tenantId)
    .single();
  if (duplicate && Number(duplicate.id) !== holidayId) {
    throw new ConflictError('A company holiday already exists for that date');
  }

  const { data: updated, error } = await supabase.from('company_holidays').update({
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.reason !== undefined ? { reason: payload.reason.trim() } : {}),
    ...(payload.reason !== undefined ? { reason: payload.reason.trim() } : {}),
    year: payload.year ?? Number(nextDate.slice(0, 4)),
  })
  .eq('id', holidayId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update company holiday');
  return apiSuccess(normalizeSupabaseCompanyHoliday(updated), 'Company holiday updated successfully');
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const holidayId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(holidayId) || holidayId <= 0) {
    throw new BadRequestError('Valid company holiday id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('company_holidays')
    .select('id')
    .eq('id', holidayId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) {
    throw new NotFoundError('Company holiday not found');
  }

  const { data: deleted, error } = await supabase
    .from('company_holidays')
    .delete()
    .eq('id', holidayId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete company holiday');
  return apiSuccess(normalizeSupabaseCompanyHoliday(deleted), 'Company holiday deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
