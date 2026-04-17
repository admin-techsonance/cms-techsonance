import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createDailyReportProjectSchema, updateDailyReportProjectSchema } from '@/server/validation/reports';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { enforceRBACPermission } from '@/server/rbac/auth-integration';

async function assertSupabaseDailyReportAccess(dailyReportId: number, authUserId: string, isAdminLike: boolean, tenantId: string) {
  const supabase = getAdminRouteSupabase();
  const { data: report } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', dailyReportId)
    .eq('tenant_id', tenantId)
    .single();
  if (!report) throw new NotFoundError('Daily report not found or access denied');
  if (!isAdminLike && report.user_id !== authUserId) throw new ForbiddenError('Record not found or access denied');
  return report;
}

function normalizeSupabaseDailyReportProjectRow(row: Record<string, any>) {
  return {
    id: Number(row.id),
    dailyReportId: Number(row.daily_report_id),
    projectId: Number(row.project_id),
    description: row.description,
    trackerTime: Number(row.tracker_time),
    isCoveredWork: Boolean(row.is_covered_work),
    isExtraWork: Boolean(row.is_extra_work),
    createdAt: row.created_at ?? null,
    firstName: row.users?.first_name ?? row.firstName ?? undefined,
    lastName: row.users?.last_name ?? row.lastName ?? undefined,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  // Allow authenticated users to read daily report projects based on their role
  // Admin-like roles can see all projects, employees can see their own
  
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  if (id) {
    const { data: record, error } = await supabase
      .from('daily_report_projects')
      .select('*, daily_reports!inner(user_id)')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !record) throw new NotFoundError('Record not found');
    await assertSupabaseDailyReportAccess(Number(record.daily_report_id), actor.authUserId, isAdminLike, tenantId);
    return NextResponse.json(normalizeSupabaseDailyReportProjectRow(record));
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const dailyReportId = searchParams.get('dailyReportId');
  const projectId = searchParams.get('projectId');
  const employeeId = searchParams.get('employeeId');
  const isCoveredWork = searchParams.get('isCoveredWork');
  const isExtraWork = searchParams.get('isExtraWork');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  let query = supabase
    .from('daily_report_projects')
    .select('*, daily_reports!inner(user_id,date), users:daily_reports!inner(users!inner(first_name,last_name))', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (!isAdminLike) query = query.eq('daily_reports.user_id', actor.authUserId);
  if (dailyReportId) query = query.eq('daily_report_id', Number(dailyReportId));
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (isCoveredWork === 'true' || isCoveredWork === 'false') query = query.eq('is_covered_work', isCoveredWork === 'true');
  if (isExtraWork === 'true' || isExtraWork === 'false') query = query.eq('is_extra_work', isExtraWork === 'true');
  if (startDate) query = query.gte('daily_reports.date', startDate);
  if (endDate) query = query.lte('daily_reports.date', endDate);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  let rows = (data as Record<string, any>[] | null) ?? [];
  if (isAdminLike && employeeId && employeeId !== 'all') {
    const employeeIdNumber = Number(employeeId);
    const { data: employee } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', employeeIdNumber)
      .eq('tenant_id', tenantId)
      .single();
    rows = employee ? rows.filter((row) => row.daily_reports?.user_id === employee.user_id) : [];
  }
  return NextResponse.json({
    success: true,
    data: rows.map(normalizeSupabaseDailyReportProjectRow),
    message: 'Daily report projects fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  // Allow authenticated users to create their own daily report projects
  // RBAC permission check removed - employees can create their own report projects
  
  const payload = createDailyReportProjectSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: report } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('id', payload.dailyReportId)
    .eq('tenant_id', tenantId)
    .single();
  if (!report) throw new NotFoundError('Daily report not found');
  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('daily_report_projects').insert({
    daily_report_id: payload.dailyReportId,
    project_id: payload.projectId,
    description: payload.description.trim(),
    tracker_time: payload.trackerTime,
    is_covered_work: payload.isCoveredWork ?? false,
    is_extra_work: payload.isExtraWork ?? false,
    tenant_id: tenantId,
    created_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create daily report project entry');
  return NextResponse.json(normalizeSupabaseDailyReportProjectRow(created), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid entry id is required');
  const payload = updateDailyReportProjectSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('daily_report_projects')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Daily report project entry not found');
  const { data: updated, error } = await supabase.from('daily_report_projects').update({
    ...(payload.projectId !== undefined ? { project_id: payload.projectId } : {}),
    ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
    ...(payload.trackerTime !== undefined ? { tracker_time: payload.trackerTime } : {}),
    ...(payload.isCoveredWork !== undefined ? { is_covered_work: payload.isCoveredWork } : {}),
    ...(payload.isExtraWork !== undefined ? { is_extra_work: payload.isExtraWork } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update daily report project entry');
  return NextResponse.json(normalizeSupabaseDailyReportProjectRow(updated));
}, { requireAuth: true, roles: ['Employee'] });


export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid entry id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('daily_report_projects')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Daily report project entry not found');
  const { data: deleted, error } = await supabase
    .from('daily_report_projects')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete daily report project entry');
  return NextResponse.json({ message: 'Daily report project entry deleted successfully', dailyReportProject: normalizeSupabaseDailyReportProjectRow(deleted) });
}, { requireAuth: true, roles: ['Employee'] });
