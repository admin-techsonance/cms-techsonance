import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dailyReports, employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createDailyReportSchema, updateDailyReportSchema } from '@/server/validation/reports';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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
  const [deleted] = await db.delete(dailyReports).where(and(eq(dailyReports.id, id), eq(dailyReports.userId, context.auth!.user.id))).returning();
  if (!deleted) throw new NotFoundError('Daily report not found');
  return NextResponse.json({ message: 'Daily report deleted successfully', report: deleted });
}, { requireAuth: true, roles: ['Employee'] });

