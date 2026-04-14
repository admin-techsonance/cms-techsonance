import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createInquiryFeedSchema, updateInquiryFeedSchema } from '@/server/validation/crm';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseInquiryFeedRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const commentedBy = typeof row.commented_by === 'string' ? userMap.get(row.commented_by) ?? null : null;
  return {
    id: Number(row.id),
    inquiryId: Number(row.inquiry_id),
    commentedBy,
    technology: row.technology ?? null,
    description: row.description,
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
    const feedId = Number(id);
    if (!Number.isInteger(feedId) || feedId <= 0) throw new BadRequestError('Valid inquiry feed id is required');
    const { data, error } = await supabase
      .from('inquiry_feeds')
      .select('*')
      .eq('id', feedId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Inquiry feed not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const inquiryIdParam = searchParams.get('inquiryId');
  let query = supabase
    .from('inquiry_feeds')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (inquiryIdParam) {
    const inquiryId = Number(inquiryIdParam);
    if (!Number.isInteger(inquiryId) || inquiryId <= 0) throw new BadRequestError('Valid inquiry id is required');
    query = query.eq('inquiry_id', inquiryId);
  }
  const { data, count, error } = await query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.commented_by)).filter(Boolean), tenantId);
  return apiSuccess(rows.map((row) => normalizeSupabaseInquiryFeedRow(row, userMap)), 'Inquiry feeds fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInquiryFeedSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id')
    .eq('id', payload.inquiryId)
    .eq('tenant_id', tenantId)
    .single();
  if (!inquiry) throw new NotFoundError('Inquiry not found');
  const { data, error } = await supabase.from('inquiry_feeds').insert({
    inquiry_id: payload.inquiryId,
    commented_by: actor.authUserId,
    technology: payload.technology ?? null,
    description: payload.description,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create inquiry feed');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  const payload = updateInquiryFeedSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update an inquiry feed');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('inquiry_feeds')
    .select('*')
    .eq('id', feedId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Inquiry feed not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commented_by !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to update this inquiry feed');
  }
  const { data, error } = await supabase.from('inquiry_feeds').update({
    ...(payload.technology !== undefined ? { technology: payload.technology } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  })
  .eq('id', feedId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to update inquiry feed');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('inquiry_feeds')
    .select('*')
    .eq('id', feedId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Inquiry feed not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commented_by !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to delete this inquiry feed');
  }
  const { data, error } = await supabase
    .from('inquiry_feeds')
    .delete()
    .eq('id', feedId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to delete inquiry feed');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.commented_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseInquiryFeedRow(data, userMap), 'Inquiry feed deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
