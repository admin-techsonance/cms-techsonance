import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createActivityLogSchema } from '@/server/validation/admin-logs';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseActivityLogRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;

  return {
    id: Number(row.id),
    userId,
    action: row.action,
    module: row.module,
    details: row.details ?? null,
    ipAddress: row.ip_address ?? null,
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
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      throw new BadRequestError('Valid activity log id is required');
    }

    const { data: record, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('id', recordId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !record) throw new NotFoundError('Activity log not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(record.user_id)].filter(Boolean), tenantId);
    return NextResponse.json(normalizeSupabaseActivityLogRow(record, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const module = searchParams.get('module');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  let query = supabase
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (userId) {
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }
    query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericUserId, tenantId));
  }
  if (action) query = query.eq('action', action);
  if (module) query = query.eq('module', module);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  if (search) query = query.or(`action.ilike.%${search}%,module.ilike.%${search}%`);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean), tenantId);
  return NextResponse.json({
    success: true,
    data: rows.map((row) => normalizeSupabaseActivityLogRow(row, userMap)),
    message: 'Activity logs fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createActivityLogSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId);
  const { data: created, error } = await supabase.from('activity_logs').insert({
    user_id: authUserId,
    action: payload.action.trim(),
    module: payload.module.trim(),
    details: payload.details ?? null,
    ip_address: payload.ipAddress ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create activity log');
  const userMap = await buildLegacyUserIdMap(accessToken, [authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseActivityLogRow(created, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid activity log id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('activity_logs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    
  if (error || !deleted) throw new NotFoundError('Activity log not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean), tenantId);
  return NextResponse.json({
    message: 'Activity log deleted successfully',
    deletedRecord: normalizeSupabaseActivityLogRow(deleted, userMap),
  });
}, { requireAuth: true, roles: ['Admin'] });
