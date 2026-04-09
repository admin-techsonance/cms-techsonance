import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { dailyReportProjects, dailyReports, employees, projects, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createDailyReportProjectSchema, updateDailyReportProjectSchema } from '@/server/validation/reports';

async function assertDailyReportAccess(dailyReportId: number, userId: number, isAdminLike: boolean) {
  const report = await db.select().from(dailyReports).where(eq(dailyReports.id, dailyReportId)).limit(1);
  if (report.length === 0) throw new NotFoundError('Daily report not found or access denied');
  if (!isAdminLike && report[0].userId !== userId) throw new ForbiddenError('Record not found or access denied');
  return report[0];
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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
  await assertDailyReportAccess(payload.dailyReportId, context.auth!.user.id, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager');
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
  const existingRecord = await db.select({ id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId }).from(dailyReportProjects).where(eq(dailyReportProjects.id, id)).limit(1);
  if (!existingRecord[0]) throw new NotFoundError('Record not found or access denied');
  await assertDailyReportAccess(existingRecord[0].dailyReportId, context.auth!.user.id, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager');
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
  const existingRecord = await db.select({ id: dailyReportProjects.id, dailyReportId: dailyReportProjects.dailyReportId }).from(dailyReportProjects).where(eq(dailyReportProjects.id, id)).limit(1);
  if (!existingRecord[0]) throw new NotFoundError('Record not found or access denied');
  await assertDailyReportAccess(existingRecord[0].dailyReportId, context.auth!.user.id, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin' || context.auth!.user.role === 'Manager');
  const [deleted] = await db.delete(dailyReportProjects).where(eq(dailyReportProjects.id, id)).returning();
  return NextResponse.json({ message: 'Daily report project deleted successfully', record: deleted });
}, { requireAuth: true, roles: ['Employee'] });

