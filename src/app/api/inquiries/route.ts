import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createInquirySchema, updateInquirySchema } from '@/server/validation/crm';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseInquiryRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const createdBy = typeof row.created_by === 'string' ? userMap.get(row.created_by) ?? null : null;
  return {
    id: Number(row.id),
    aliasName: row.alias_name,
    tag: row.tag,
    status: row.status,
    dueDate: row.due_date ?? null,
    appStatus: row.app_status ?? null,
    isFavourite: Boolean(row.is_favourite ?? false),
    createdBy,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
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
    const inquiryId = Number(id);
    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
      throw new BadRequestError('Valid inquiry id is required');
    }
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .eq('id', inquiryId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Inquiry not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseInquiryRow(data, userMap), 'Inquiry fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const tag = searchParams.get('tag');
  const status = searchParams.get('status');
  const appStatus = searchParams.get('appStatus');
  const isFavourite = searchParams.get('isFavourite');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  let query = supabase
    .from('inquiries')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) query = query.ilike('alias_name', `%${search}%`);
  if (tag) query = query.eq('tag', tag);
  if (status) query = query.eq('status', status);
  if (appStatus) query = query.eq('app_status', appStatus);
  if (isFavourite !== null) query = query.eq('is_favourite', isFavourite === 'true' || isFavourite === '1');
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.created_by)).filter(Boolean), tenantId);
  return apiSuccess(rows.map((row) => normalizeSupabaseInquiryRow(row, userMap)), 'Inquiries fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInquirySchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('inquiries').insert({
    alias_name: payload.aliasName,
    tag: payload.tag,
    status: payload.status,
    due_date: payload.dueDate ?? null,
    app_status: payload.appStatus ?? 'open',
    is_favourite: payload.isFavourite ?? false,
    created_by: actor.authUserId,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create inquiry');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return apiSuccess(normalizeSupabaseInquiryRow(data, userMap), 'Inquiry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const inquiryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    throw new BadRequestError('Valid inquiry id is required');
  }

  const payload = updateInquirySchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update an inquiry');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase.from('inquiries').select('*').eq('id', inquiryId).eq('tenant_id', tenantId).single();
  if (!existing) throw new NotFoundError('Inquiry not found');
  const { data, error } = await supabase.from('inquiries').update({
    ...(payload.aliasName !== undefined ? { alias_name: payload.aliasName } : {}),
    ...(payload.tag !== undefined ? { tag: payload.tag } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.dueDate !== undefined ? { due_date: payload.dueDate } : {}),
    ...(payload.appStatus !== undefined ? { app_status: payload.appStatus } : {}),
    ...(payload.isFavourite !== undefined ? { is_favourite: payload.isFavourite } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', inquiryId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to update inquiry');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseInquiryRow(data, userMap), 'Inquiry updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const inquiryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    throw new BadRequestError('Valid inquiry id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('inquiries')
    .select('*')
    .eq('id', inquiryId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Inquiry not found');
  const { data, error } = await supabase.from('inquiries').update({
    app_status: 'close',
    updated_at: new Date().toISOString(),
  })
  .eq('id', inquiryId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to close inquiry');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseInquiryRow(data, userMap), 'Inquiry closed successfully');
}, { requireAuth: true, roles: ['Employee'] });
