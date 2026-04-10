import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dailyReportProjects, dailyReports, employees, projects, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createDailyReportProjectSchema, updateDailyReportProjectSchema } from '@/server/validation/reports';
import { getCurrentSupabaseActor, getRouteSupabase } from '@/server/supabase/route-helpers';

async function assertDailyReportAccess(dailyReportId: number, userId: number, isAdminLike: boolean) {
  const report = await db.select().from(dailyReports).where(eq(dailyReports.id, dailyReportId)).limit(1);
  if (report.length === 0) throw new NotFoundError('Daily report not found or access denied');
  if (!isAdminLike && report[0].userId !== userId) throw new ForbiddenError('Record not found or access denied');
  return report[0];
}

async function assertSupabaseDailyReportAccess(dailyReportId: number, authUserId: string, isAdminLike: boolean, accessToken: string) {
  const supabase = getRouteSupabase(accessToken);
  const { data: report } = await supabase.from('daily_reports').select('*').eq('id', dailyReportId).single();
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
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      const { data: record, error } = await supabase
        .from('daily_report_projects')
        .select('*, daily_reports!inner(user_id)')
        .eq('id', Number(id))
        .single();
      if (error || !record) throw new NotFoundError('Record not found');
      await assertSupabaseDailyReportAccess(Number(record.daily_report_id), actor.authUserId, isAdminLike, accessToken);
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
    let query = supabase.from('daily_report_projects').select('*, daily_reports!inner(user_id,date), users:daily_reports!inner(users!inner(first_name,last_name))', { count: 'exact' });
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
      const { data: employee } = await supabase.from('employees').select('user_id').eq('id', employeeIdNumber).single();
      rows = employee ? rows.filter((row) => row.daily_reports?.user_id === employee.user_id) : [];
    }
    return NextResponse.json({
      success: true,
      data: rows.map(normalizeSupabaseDailyReportProjectRow),
      message: 'Daily report projects fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id) {
    const record = await db.select({
      id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId, projectId: dailyReportProjects.projectId, description: dailyReportProjects.description, trackerTime: dailyReportProjects.trackerTime, isCoveredWork: dailyReportProjects.isCoveredWork, isExtraWork: dailyReportProjects.isExtraWork, createdAt: dailyReportProjects.createdAt,
    }).from(dailyReportProjects).innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id)).where(eq(dailyReportProjects.id, Number(id))).limit(1);
    if (!record[0]) throw new NotFoundError('Record not found');
    await assertDailyReportAccess(record[0].dailyReportId, user.id, isAdminLike);
    return NextResponse.json(record[0]);
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
  const conditions = [];
  if (!isAdminLike) conditions.push(eq(dailyReports.userId, user.id));
  else if (employeeId && employeeId !== 'all') conditions.push(eq(employees.id, Number(employeeId)));
  if (dailyReportId) conditions.push(eq(dailyReportProjects.dailyReportId, Number(dailyReportId)));
  if (projectId) conditions.push(eq(dailyReportProjects.projectId, Number(projectId)));
  if (isCoveredWork === 'true' || isCoveredWork === 'false') conditions.push(eq(dailyReportProjects.isCoveredWork, isCoveredWork === 'true'));
  if (isExtraWork === 'true' || isExtraWork === 'false') conditions.push(eq(dailyReportProjects.isExtraWork, isExtraWork === 'true'));
  if (startDate) conditions.push(gte(dailyReports.date, startDate));
  if (endDate) conditions.push(lte(dailyReports.date, endDate));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const baseQuery = db.select({
    id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId, projectId: dailyReportProjects.projectId, description: dailyReportProjects.description, trackerTime: dailyReportProjects.trackerTime, isCoveredWork: dailyReportProjects.isCoveredWork, isExtraWork: dailyReportProjects.isExtraWork, createdAt: dailyReportProjects.createdAt, firstName: users.firstName, lastName: users.lastName,
  }).from(dailyReportProjects).innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id)).innerJoin(users, eq(dailyReports.userId, users.id)).leftJoin(employees, eq(users.id, employees.userId));
  const [rows, countRows] = await Promise.all([
    (whereClause ? baseQuery.where(whereClause) : baseQuery).orderBy(desc(dailyReportProjects.createdAt)).limit(limit).offset(offset),
    (whereClause ? db.select({ count: sql<number>`count(*)` }).from(dailyReportProjects).innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id)).innerJoin(users, eq(dailyReports.userId, users.id)).leftJoin(employees, eq(users.id, employees.userId)).where(whereClause) : db.select({ count: sql<number>`count(*)` }).from(dailyReportProjects)),
  ]);
  return NextResponse.json({ success: true, data: rows, message: 'Daily report projects fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createDailyReportProjectSchema.parse(await request.json());
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    await assertSupabaseDailyReportAccess(payload.dailyReportId, actor.authUserId, isAdminLike, accessToken);
    const { data: project } = await supabase.from('projects').select('id').eq('id', payload.projectId).single();
    if (!project) throw new NotFoundError('Project not found');
    const { data: created, error } = await supabase.from('daily_report_projects').insert({
      daily_report_id: payload.dailyReportId,
      project_id: payload.projectId,
      description: payload.description.trim(),
      tracker_time: payload.trackerTime,
      is_covered_work: payload.isCoveredWork ?? false,
      is_extra_work: payload.isExtraWork ?? false,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create daily report project');
    return NextResponse.json(normalizeSupabaseDailyReportProjectRow(created), { status: 201 });
  }

  await assertDailyReportAccess(payload.dailyReportId, context.auth!.user.id, isAdminLike);
  const project = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
  if (project.length === 0) throw new NotFoundError('Project not found');
  const [created] = await db.insert(dailyReportProjects).values({
    dailyReportId: payload.dailyReportId,
    projectId: payload.projectId,
    description: payload.description,
    trackerTime: payload.trackerTime,
    isCoveredWork: payload.isCoveredWork ?? false,
    isExtraWork: payload.isExtraWork ?? false,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report project id is required');
  const payload = updateDailyReportProjectSchema.parse(await request.json());
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existingRecord } = await supabase.from('daily_report_projects').select('id,daily_report_id').eq('id', id).single();
    if (!existingRecord) throw new NotFoundError('Record not found or access denied');
    await assertSupabaseDailyReportAccess(Number(existingRecord.daily_report_id), actor.authUserId, isAdminLike, accessToken);
    if (payload.projectId !== undefined) {
      const { data: project } = await supabase.from('projects').select('id').eq('id', payload.projectId).single();
      if (!project) throw new NotFoundError('Project not found');
    }
    const { data: updated, error } = await supabase.from('daily_report_projects').update({
      ...(payload.projectId !== undefined ? { project_id: payload.projectId } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.trackerTime !== undefined ? { tracker_time: payload.trackerTime } : {}),
      ...(payload.isCoveredWork !== undefined ? { is_covered_work: payload.isCoveredWork } : {}),
      ...(payload.isExtraWork !== undefined ? { is_extra_work: payload.isExtraWork } : {}),
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update daily report project');
    return NextResponse.json(normalizeSupabaseDailyReportProjectRow(updated));
  }

  const existingRecord = await db.select({ id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId }).from(dailyReportProjects).where(eq(dailyReportProjects.id, id)).limit(1);
  if (!existingRecord[0]) throw new NotFoundError('Record not found or access denied');
  await assertDailyReportAccess(existingRecord[0].dailyReportId, context.auth!.user.id, isAdminLike);
  if (payload.projectId !== undefined) {
    const project = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
    if (project.length === 0) throw new NotFoundError('Project not found');
  }
  const [updated] = await db.update(dailyReportProjects).set({
    ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.trackerTime !== undefined ? { trackerTime: payload.trackerTime } : {}),
    ...(payload.isCoveredWork !== undefined ? { isCoveredWork: payload.isCoveredWork } : {}),
    ...(payload.isExtraWork !== undefined ? { isExtraWork: payload.isExtraWork } : {}),
  }).where(eq(dailyReportProjects.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report project id is required');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existingRecord } = await supabase.from('daily_report_projects').select('id,daily_report_id').eq('id', id).single();
    if (!existingRecord) throw new NotFoundError('Record not found or access denied');
    await assertSupabaseDailyReportAccess(Number(existingRecord.daily_report_id), actor.authUserId, isAdminLike, accessToken);
    const { data: deleted, error } = await supabase.from('daily_report_projects').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete daily report project');
    return NextResponse.json({ message: 'Daily report project deleted successfully', record: normalizeSupabaseDailyReportProjectRow(deleted) });
  }

  const existingRecord = await db.select({ id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId }).from(dailyReportProjects).where(eq(dailyReportProjects.id, id)).limit(1);
  if (!existingRecord[0]) throw new NotFoundError('Record not found or access denied');
  await assertDailyReportAccess(existingRecord[0].dailyReportId, context.auth!.user.id, isAdminLike);
  const [deleted] = await db.delete(dailyReportProjects).where(eq(dailyReportProjects.id, id)).returning();
  return NextResponse.json({ message: 'Daily report project deleted successfully', record: deleted });
}, { requireAuth: true, roles: ['Employee'] });
