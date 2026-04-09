import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, leaveRequests } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createLeaveRequestSchema, updateLeaveRequestSchema } from '@/server/validation/hr';

async function getCurrentEmployee(userId: number) {
  const [employee] = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return employee ?? null;
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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
  const employeeId = isAdminLike && payload.employeeId ? payload.employeeId : (await getCurrentEmployee(user.id))?.id;
  if (!employeeId) throw new NotFoundError('Employee record not found for current user');
  if (new Date(payload.startDate) > new Date(payload.endDate)) throw new UnprocessableEntityError('Start date must be before end date');
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
  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Leave request not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
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
  const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Leave request not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike) {
    const employee = await getCurrentEmployee(user.id);
    if (!employee || employee.id !== existing.employeeId) throw new ForbiddenError('Unauthorized');
    if (existing.status !== 'pending') throw new BadRequestError('Only pending leave requests can be deleted');
  }
  const [deleted] = await db.delete(leaveRequests).where(eq(leaveRequests.id, id)).returning();
  return NextResponse.json({ message: 'Leave request deleted successfully', leaveRequest: deleted });
}, { requireAuth: true, roles: ['Employee'] });

