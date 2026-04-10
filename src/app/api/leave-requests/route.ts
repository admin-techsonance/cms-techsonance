import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, leaveRequests } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createLeaveRequestSchema, updateLeaveRequestSchema } from '@/server/validation/hr';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

async function getCurrentEmployee(userId: number) {
  const [employee] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return employee ?? null;
}

async function getCurrentSupabaseEmployee(accessToken: string, authUserId: string) {
  const supabase = getRouteSupabase(accessToken);
  const { data: employee } = await supabase.from('employees').select('id').eq('user_id', authUserId).single();
  return employee ?? null;
}

function normalizeSupabaseLeaveRequestRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const approvedBy = typeof row.approved_by === 'string' ? userMap.get(row.approved_by) ?? null : null;
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    leavePeriod: row.leave_period,
    actualDays: row.actual_days,
    approvedBy,
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
      const leaveRequestId = Number(id);
      if (!Number.isInteger(leaveRequestId) || leaveRequestId <= 0) {
        throw new BadRequestError('Valid leave request id is required');
      }
      const { data: leaveRequest, error } = await supabase.from('leave_requests').select('*').eq('id', leaveRequestId).single();
      if (error || !leaveRequest) throw new NotFoundError('Leave request not found');
      if (!isAdminLike) {
        const employee = await getCurrentSupabaseEmployee(accessToken, actor.authUserId);
        if (!employee || Number(employee.id) !== Number(leaveRequest.employee_id)) throw new ForbiddenError('Unauthorized');
      }
      const userMap = await buildLegacyUserIdMap(accessToken, [String(leaveRequest.approved_by)].filter(Boolean));
      return NextResponse.json(normalizeSupabaseLeaveRequestRow(leaveRequest, userMap));
    }
    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const employeeIdParam = searchParams.get('employeeId');
    const leaveType = searchParams.get('leaveType');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    let query = supabase.from('leave_requests').select('*', { count: 'exact' });
    if (!isAdminLike) {
      const employee = await getCurrentSupabaseEmployee(accessToken, actor.authUserId);
      if (!employee) return NextResponse.json([]);
      query = query.eq('employee_id', employee.id);
    } else if (employeeIdParam) {
      query = query.eq('employee_id', Number(employeeIdParam));
    }
    if (leaveType) query = query.eq('leave_type', leaveType);
    if (status) query = query.eq('status', status);
    if (startDate) query = query.gte('start_date', startDate);
    if (endDate) query = query.lte('end_date', endDate);
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.approved_by)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabaseLeaveRequestRow(row, userMap)),
      message: 'Leave requests fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id) {
    const [leaveRequest] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(id))).limit(1);
    if (!leaveRequest) throw new NotFoundError('Leave request not found');
    if (!isAdminLike) {
      const employee = await getCurrentEmployee(user.id);
      if (!employee || employee.id !== leaveRequest.employeeId) throw new ForbiddenError('Unauthorized');
    }
    return NextResponse.json(leaveRequest);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const employeeIdParam = searchParams.get('employeeId');
  const leaveType = searchParams.get('leaveType');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const conditions = [];
  if (!isAdminLike) {
    const employee = await getCurrentEmployee(user.id);
    if (!employee) return NextResponse.json([]);
    conditions.push(eq(leaveRequests.employeeId, employee.id));
  } else if (employeeIdParam) {
    conditions.push(eq(leaveRequests.employeeId, Number(employeeIdParam)));
  }
  if (leaveType) conditions.push(eq(leaveRequests.leaveType, leaveType));
  if (status) conditions.push(eq(leaveRequests.status, status));
  if (startDate) conditions.push(gte(leaveRequests.startDate, startDate));
  if (endDate) conditions.push(lte(leaveRequests.endDate, endDate));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(leaveRequests);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(leaveRequests);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(leaveRequests.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Leave requests fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createLeaveRequestSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (new Date(payload.startDate) > new Date(payload.endDate)) throw new UnprocessableEntityError('Start date must be before end date');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const employeeId = isAdminLike && payload.employeeId ? payload.employeeId : (await getCurrentSupabaseEmployee(accessToken, actor.authUserId))?.id;
    if (!employeeId) throw new NotFoundError('Employee record not found for current user');
    const { data: employee } = await supabase.from('employees').select('id').eq('id', employeeId).single();
    if (!employee) throw new NotFoundError('Employee not found');
    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('leave_requests').insert({
      employee_id: employeeId,
      leave_type: payload.leaveType,
      start_date: payload.startDate,
      end_date: payload.endDate,
      reason: payload.reason.trim(),
      status: 'pending',
      leave_period: payload.leavePeriod ?? 'full_day',
      actual_days: payload.actualDays ?? 1,
      approved_by: null,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create leave request');
    return NextResponse.json(normalizeSupabaseLeaveRequestRow(created, new Map()), { status: 201 });
  }

  const employeeId = isAdminLike && payload.employeeId ? payload.employeeId : (await getCurrentEmployee(user.id))?.id;
  if (!employeeId) throw new NotFoundError('Employee record not found for current user');
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new NotFoundError('Employee not found');
  const now = new Date().toISOString();
  const [created] = await db.insert(leaveRequests).values({
    employeeId,
    leaveType: payload.leaveType,
    startDate: payload.startDate,
    endDate: payload.endDate,
    reason: payload.reason,
    status: 'pending',
    leavePeriod: payload.leavePeriod ?? 'full_day',
    actualDays: payload.actualDays ?? 1,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid leave request id is required');
  const payload = updateLeaveRequestSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('leave_requests').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Leave request not found');
    if (!isAdminLike) {
      const employee = await getCurrentSupabaseEmployee(accessToken, actor.authUserId);
      if (!employee || Number(employee.id) !== Number(existing.employee_id)) throw new ForbiddenError('Unauthorized');
      if (existing.status !== 'pending') throw new BadRequestError('Only pending leave requests can be modified');
    }
    const nextStart = payload.startDate ?? String(existing.start_date);
    const nextEnd = payload.endDate ?? String(existing.end_date);
    if (new Date(nextStart) > new Date(nextEnd)) throw new UnprocessableEntityError('Start date must be before end date');
    const { data: updated, error } = await supabase.from('leave_requests').update({
      ...(payload.leaveType !== undefined ? { leave_type: payload.leaveType } : {}),
      ...(payload.startDate !== undefined ? { start_date: payload.startDate } : {}),
      ...(payload.endDate !== undefined ? { end_date: payload.endDate } : {}),
      ...(payload.reason !== undefined ? { reason: payload.reason.trim() } : {}),
      ...(payload.leavePeriod !== undefined ? { leave_period: payload.leavePeriod } : {}),
      ...(payload.actualDays !== undefined ? { actual_days: payload.actualDays } : {}),
      ...(payload.status !== undefined
        ? { status: payload.status, approved_by: isAdminLike && payload.status === 'approved' ? actor.authUserId : existing.approved_by }
        : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update leave request');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.approved_by)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseLeaveRequestRow(updated, userMap));
  }

  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Leave request not found');
  if (!isAdminLike) {
    const employee = await getCurrentEmployee(user.id);
    if (!employee || employee.id !== existing.employeeId) throw new ForbiddenError('Unauthorized');
    if (existing.status !== 'pending') throw new BadRequestError('Only pending leave requests can be modified');
  }
  const nextStart = payload.startDate ?? existing.startDate;
  const nextEnd = payload.endDate ?? existing.endDate;
  if (new Date(nextStart) > new Date(nextEnd)) throw new UnprocessableEntityError('Start date must be before end date');
  const [updated] = await db.update(leaveRequests).set({
    ...(payload.leaveType !== undefined ? { leaveType: payload.leaveType } : {}),
    ...(payload.startDate !== undefined ? { startDate: payload.startDate } : {}),
    ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
    ...(payload.leavePeriod !== undefined ? { leavePeriod: payload.leavePeriod } : {}),
    ...(payload.actualDays !== undefined ? { actualDays: payload.actualDays } : {}),
    ...(payload.status !== undefined ? { status: payload.status, approvedBy: isAdminLike && payload.status === 'approved' ? user.id : existing.approvedBy } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(leaveRequests.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid leave request id is required');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('leave_requests').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Leave request not found');
    if (!isAdminLike) {
      const employee = await getCurrentSupabaseEmployee(accessToken, actor.authUserId);
      if (!employee || Number(employee.id) !== Number(existing.employee_id)) throw new ForbiddenError('Unauthorized');
      if (existing.status !== 'pending') throw new BadRequestError('Only pending leave requests can be deleted');
    }
    const { data: deleted, error } = await supabase.from('leave_requests').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete leave request');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.approved_by)].filter(Boolean));
    return NextResponse.json({ message: 'Leave request deleted successfully', leaveRequest: normalizeSupabaseLeaveRequestRow(deleted, userMap) });
  }

  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Leave request not found');
  if (!isAdminLike) {
    const employee = await getCurrentEmployee(user.id);
    if (!employee || employee.id !== existing.employeeId) throw new ForbiddenError('Unauthorized');
    if (existing.status !== 'pending') throw new BadRequestError('Only pending leave requests can be deleted');
  }
  const [deleted] = await db.delete(leaveRequests).where(eq(leaveRequests.id, id)).returning();
  return NextResponse.json({ message: 'Leave request deleted successfully', leaveRequest: deleted });
}, { requireAuth: true, roles: ['Employee'] });
