import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createDailyReportSchema, updateDailyReportSchema } from '@/server/validation/reports';
import { enforceRBACPermission } from '@/server/rbac/auth-integration';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
} from '@/server/supabase/route-helpers';

async function listSupabaseEmployeesByAuthIds(tenantId: string, authUserIds: string[]) {
  if (!authUserIds.length) return new Map<string, number | null>();
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('employees')
    .select('id,user_id')
    .in('user_id', authUserIds)
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return new Map<string, number | null>(((data as { id: number; user_id: string }[] | null) ?? []).map((row) => [row.user_id, Number(row.id)]));
}

function normalizeSupabaseDailyReportRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>,
  employeeMap: Map<string, number | null>
) {
  const authUserId = typeof row.user_id === 'string' ? row.user_id : '';
  return {
    id: Number(row.id),
    userId: userMap.get(authUserId) ?? null,
    employeeId: employeeMap.get(authUserId) ?? null,
    firstName: row.user_first_name ?? null,
    lastName: row.user_last_name ?? null,
    email: row.user_email ?? null,
    date: row.date,
    availableStatus: row.available_status,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  // Allow authenticated users to read reports based on their role
  // Admin-like roles can see all reports, employees can see their own
  
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    let query = supabase
      .from('daily_reports')
      .select('*, users!inner(first_name,last_name,email)')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId);
    if (!isAdminLike) query = query.eq('user_id', actor.authUserId);
    const { data: record, error } = await query.single();
    if (error || !record) throw new NotFoundError('Daily report not found');
    const authIds = [String(record.user_id)];
    const userMap = await buildLegacyUserIdMap(accessToken, authIds, tenantId);
    const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, authIds);
    const normalized = normalizeSupabaseDailyReportRow({
      ...record,
      user_first_name: record.users?.first_name ?? null,
      user_last_name: record.users?.last_name ?? null,
      user_email: record.users?.email ?? null,
    }, userMap, employeeMap);
    return NextResponse.json(normalized);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');
  const availableStatus = searchParams.get('availableStatus');
  let query = supabase
    .from('daily_reports')
    .select('*, users!inner(first_name,last_name,email)', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (!isAdminLike) query = query.eq('user_id', actor.authUserId);
  if (availableStatus && availableStatus !== 'all') query = query.eq('available_status', availableStatus);
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, any>[] | null) ?? [];
  let filteredRows = rows;
  const authIds = rows.map((row) => String(row.user_id)).filter(Boolean);
  const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, authIds);
  if (isAdminLike && employeeId && employeeId !== 'all') {
    filteredRows = rows.filter((row) => employeeMap.get(String(row.user_id)) === Number(employeeId));
  }
  const userMap = await buildLegacyUserIdMap(accessToken, authIds, tenantId);
  return NextResponse.json({
    success: true,
    data: filteredRows.map((row) => normalizeSupabaseDailyReportRow({
      ...row,
      user_first_name: row.users?.first_name ?? null,
      user_last_name: row.users?.last_name ?? null,
      user_email: row.users?.email ?? null,
    }, userMap, employeeMap)),
    message: 'Daily reports fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  // Allow authenticated users to create their own daily reports
  // RBAC permission check removed - employees can create their own reports
  
  const payload = createDailyReportSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('user_id', actor.authUserId)
    .eq('date', payload.date)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  
  if (existing) {
    const { data: updated, error } = await supabase.from('daily_reports').update({
      available_status: payload.availableStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update daily report');
    
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
    const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, [actor.authUserId]);
    return NextResponse.json(normalizeSupabaseDailyReportRow(updated, userMap, employeeMap));
  }
  
  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('daily_reports').insert({
    user_id: actor.authUserId,
    date: payload.date,
    available_status: payload.availableStatus,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create daily report');
  
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, [actor.authUserId]);
  return NextResponse.json(normalizeSupabaseDailyReportRow(created, userMap, employeeMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report id is required');
  const payload = updateDailyReportSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Daily report not found');
  
  const { data: updated, error } = await supabase.from('daily_reports').update({
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.availableStatus !== undefined ? { available_status: payload.availableStatus } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update daily report');
  
  const authIds = [String(updated.user_id)];
  const userMap = await buildLegacyUserIdMap(accessToken, authIds, tenantId);
  const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, authIds);
  return NextResponse.json(normalizeSupabaseDailyReportRow(updated, userMap, employeeMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Daily report not found');
  
  const { data: deleted, error } = await supabase
    .from('daily_reports')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete daily report');
  
  const authIds = [String(deleted.user_id)];
  const userMap = await buildLegacyUserIdMap(accessToken, authIds, tenantId);
  const employeeMap = await listSupabaseEmployeesByAuthIds(tenantId, authIds);
  return NextResponse.json({ 
    message: 'Daily report deleted successfully', 
    dailyReport: normalizeSupabaseDailyReportRow(deleted, userMap, employeeMap) 
  });
}, { requireAuth: true, roles: ['Employee'] });
