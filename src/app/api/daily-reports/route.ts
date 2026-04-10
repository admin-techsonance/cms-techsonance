import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dailyReports, employees, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createDailyReportSchema, updateDailyReportSchema } from '@/server/validation/reports';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
} from '@/server/supabase/route-helpers';

async function listSupabaseEmployeesByAuthIds(accessToken: string, authUserIds: string[]) {
  if (!authUserIds.length) return new Map<string, number | null>();
  const supabase = getRouteSupabase(accessToken);
  const { data, error } = await supabase.from('employees').select('id,user_id').in('user_id', authUserIds);
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
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      let query = supabase.from('daily_reports').select('*, users!inner(first_name,last_name,email)').eq('id', Number(id));
      if (!isAdminLike) query = query.eq('user_id', actor.authUserId);
      const { data: record, error } = await query.single();
      if (error || !record) throw new NotFoundError('Daily report not found');
      const authIds = [String(record.user_id)];
      const userMap = await buildLegacyUserIdMap(accessToken, authIds);
      const employeeMap = await listSupabaseEmployeesByAuthIds(accessToken, authIds);
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
    let query = supabase.from('daily_reports').select('*, users!inner(first_name,last_name,email)', { count: 'exact' });
    if (!isAdminLike) query = query.eq('user_id', actor.authUserId);
    if (availableStatus && availableStatus !== 'all') query = query.eq('available_status', availableStatus);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, any>[] | null) ?? [];
    let filteredRows = rows;
    const authIds = rows.map((row) => String(row.user_id)).filter(Boolean);
    const employeeMap = await listSupabaseEmployeesByAuthIds(accessToken, authIds);
    if (isAdminLike && employeeId && employeeId !== 'all') {
      filteredRows = rows.filter((row) => employeeMap.get(String(row.user_id)) === Number(employeeId));
    }
    const userMap = await buildLegacyUserIdMap(accessToken, authIds);
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
  }

  if (id) {
    const conditions = [eq(dailyReports.id, Number(id))];
    if (!isAdminLike) conditions.push(eq(dailyReports.userId, user.id));
    const [record] = await db.select({
      id: dailyReports.id, userId: dailyReports.userId, employeeId: employees.id, firstName: users.firstName, lastName: users.lastName, email: users.email, date: dailyReports.date, availableStatus: dailyReports.availableStatus, createdAt: dailyReports.createdAt, updatedAt: dailyReports.updatedAt,
    }).from(dailyReports).innerJoin(users, eq(dailyReports.userId, users.id)).leftJoin(employees, eq(users.id, employees.userId)).where(and(...conditions)).limit(1);
    if (!record) throw new NotFoundError('Daily report not found');
    return NextResponse.json(record);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');
  const availableStatus = searchParams.get('availableStatus');
  const conditions = [];
  if (!isAdminLike) conditions.push(eq(dailyReports.userId, user.id));
  if (isAdminLike && employeeId && employeeId !== 'all') conditions.push(eq(employees.id, Number(employeeId)));
  if (availableStatus && availableStatus !== 'all') conditions.push(eq(dailyReports.availableStatus, availableStatus));
  if (startDate) conditions.push(gte(dailyReports.date, startDate));
  if (endDate) conditions.push(lte(dailyReports.date, endDate));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  const baseQuery = db.select({
    id: dailyReports.id, userId: dailyReports.userId, employeeId: employees.id, firstName: users.firstName, lastName: users.lastName, email: users.email, date: dailyReports.date, availableStatus: dailyReports.availableStatus, createdAt: dailyReports.createdAt, updatedAt: dailyReports.updatedAt,
  }).from(dailyReports).innerJoin(users, eq(dailyReports.userId, users.id)).leftJoin(employees, eq(users.id, employees.userId));
  const [rows, countRows] = await Promise.all([
    (whereClause ? baseQuery.where(whereClause) : baseQuery).orderBy(desc(dailyReports.createdAt)).limit(limit).offset(offset),
    (whereClause ? db.select({ count: sql<number>`count(*)` }).from(dailyReports).innerJoin(users, eq(dailyReports.userId, users.id)).leftJoin(employees, eq(users.id, employees.userId)).where(whereClause) : db.select({ count: sql<number>`count(*)` }).from(dailyReports)),
  ]);
  return NextResponse.json({ success: true, data: rows, message: 'Daily reports fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createDailyReportSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('daily_reports').select('*').eq('user_id', actor.authUserId).eq('date', payload.date).single();
    if (existing) {
      const { data: updated, error } = await supabase.from('daily_reports').update({
        available_status: payload.availableStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to update daily report');
      return NextResponse.json({
        id: Number(updated.id),
        userId: actor.legacyUserId,
        date: updated.date,
        availableStatus: updated.available_status,
        createdAt: updated.created_at ?? null,
        updatedAt: updated.updated_at ?? null,
      });
    }
    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('daily_reports').insert({
      user_id: actor.authUserId,
      date: payload.date,
      available_status: payload.availableStatus,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create daily report');
    return NextResponse.json({
      id: Number(created.id),
      userId: actor.legacyUserId,
      date: created.date,
      availableStatus: created.available_status,
      createdAt: created.created_at ?? null,
      updatedAt: created.updated_at ?? null,
    }, { status: 201 });
  }

  const [existing] = await db.select().from(dailyReports).where(and(eq(dailyReports.userId, context.auth!.user.id), eq(dailyReports.date, payload.date))).limit(1);
  if (existing) {
    const [updated] = await db.update(dailyReports).set({ availableStatus: payload.availableStatus, updatedAt: new Date().toISOString() }).where(eq(dailyReports.id, existing.id)).returning();
    return NextResponse.json(updated);
  }
  const now = new Date().toISOString();
  const [created] = await db.insert(dailyReports).values({ userId: context.auth!.user.id, date: payload.date, availableStatus: payload.availableStatus, createdAt: now, updatedAt: now }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report id is required');
  const payload = updateDailyReportSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('daily_reports').select('*').eq('id', id).eq('user_id', actor.authUserId).single();
    if (!existing) throw new NotFoundError('Daily report not found');
    if (payload.date && payload.date !== existing.date) {
      const { data: duplicate } = await supabase.from('daily_reports').select('id').eq('user_id', actor.authUserId).eq('date', payload.date).single();
      if (duplicate) throw new ConflictError('A daily report for this date already exists');
    }
    const { data: updated, error } = await supabase.from('daily_reports').update({
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.availableStatus !== undefined ? { available_status: payload.availableStatus } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update daily report');
    return NextResponse.json({
      id: Number(updated.id),
      userId: actor.legacyUserId,
      date: updated.date,
      availableStatus: updated.available_status,
      createdAt: updated.created_at ?? null,
      updatedAt: updated.updated_at ?? null,
    });
  }

  const [existing] = await db.select().from(dailyReports).where(and(eq(dailyReports.id, id), eq(dailyReports.userId, context.auth!.user.id))).limit(1);
  if (!existing) throw new NotFoundError('Daily report not found');
  if (payload.date && payload.date !== existing.date) {
    const [duplicate] = await db.select().from(dailyReports).where(and(eq(dailyReports.userId, context.auth!.user.id), eq(dailyReports.date, payload.date))).limit(1);
    if (duplicate) throw new ConflictError('A daily report for this date already exists');
  }
  const [updated] = await db.update(dailyReports).set({
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.availableStatus !== undefined ? { availableStatus: payload.availableStatus } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(dailyReports.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid daily report id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('daily_reports').delete().eq('id', id).eq('user_id', actor.authUserId).select('*').single();
    if (error || !deleted) throw new NotFoundError('Daily report not found');
    return NextResponse.json({
      message: 'Daily report deleted successfully',
      report: {
        id: Number(deleted.id),
        userId: actor.legacyUserId,
        date: deleted.date,
        availableStatus: deleted.available_status,
        createdAt: deleted.created_at ?? null,
        updatedAt: deleted.updated_at ?? null,
      },
    });
  }

  const [deleted] = await db.delete(dailyReports).where(and(eq(dailyReports.id, id), eq(dailyReports.userId, context.auth!.user.id))).returning();
  if (!deleted) throw new NotFoundError('Daily report not found');
  return NextResponse.json({ message: 'Daily report deleted successfully', report: deleted });
}, { requireAuth: true, roles: ['Employee'] });
