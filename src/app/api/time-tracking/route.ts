import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tasks, timeTracking } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createTimeTrackingSchema, timeTrackingAggregateSchema, updateTimeTrackingSchema } from '@/server/validation/assets';

async function getAccessibleTask(taskId: number, userId: number, isAdminLike: boolean) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  if (!isAdminLike && task.assignedTo !== userId) {
    throw new ForbiddenError('You are not assigned to this task');
  }
  return task;
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (id) {
    const entryId = Number(id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      throw new BadRequestError('Valid time entry id is required');
    }

    const [entry] = await db.select().from(timeTracking).where(eq(timeTracking.id, entryId)).limit(1);
    if (!entry) throw new NotFoundError('Time entry not found');
    if (!isAdminLike && entry.userId !== user.id) {
      throw new ForbiddenError('You do not have permission to view this time entry');
    }

    return apiSuccess(entry, 'Time entry fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const taskIdParam = searchParams.get('taskId');
  const filterUserIdParam = searchParams.get('userId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const aggregateParam = searchParams.get('aggregate');
  const conditions = [];

  if (!isAdminLike) {
    conditions.push(eq(timeTracking.userId, user.id));
  } else if (filterUserIdParam) {
    const filterUserId = Number(filterUserIdParam);
    if (!Number.isInteger(filterUserId) || filterUserId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }
    conditions.push(eq(timeTracking.userId, filterUserId));
  }

  if (taskIdParam) {
    const taskId = Number(taskIdParam);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new BadRequestError('Valid task id is required');
    }
    conditions.push(eq(timeTracking.taskId, taskId));
  }
  if (startDate) conditions.push(gte(timeTracking.date, startDate));
  if (endDate) conditions.push(lte(timeTracking.date, endDate));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  if (aggregateParam) {
    const aggregate = timeTrackingAggregateSchema.parse(aggregateParam);
    const groupByField = aggregate === 'task' ? timeTracking.taskId : timeTracking.userId;
    const rows = await db.select({
      id: groupByField,
      totalHours: sql<number>`sum(${timeTracking.hours})`,
      entryCount: sql<number>`count(*)`,
    }).from(timeTracking).where(whereClause).groupBy(groupByField);

    return apiSuccess({ aggregateBy: aggregate, results: rows }, 'Time tracking summary fetched successfully');
  }

  let query = db.select().from(timeTracking);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(timeTracking);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(timeTracking.date), desc(timeTracking.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Time entries fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTimeTrackingSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  await getAccessibleTask(payload.taskId, user.id, isAdminLike);

  const [created] = await db.insert(timeTracking).values({
    taskId: payload.taskId,
    userId: user.id,
    hours: payload.hours,
    date: payload.date,
    description: payload.description ?? null,
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Time entry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const entryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new BadRequestError('Valid time entry id is required');
  }

  const payload = updateTimeTrackingSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a time entry');
  }

  const [existing] = await db.select().from(timeTracking).where(eq(timeTracking.id, entryId)).limit(1);
  if (!existing) throw new NotFoundError('Time entry not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.userId !== user.id) {
    throw new ForbiddenError('You do not have permission to update this time entry');
  }
  if (payload.taskId !== undefined) {
    await getAccessibleTask(payload.taskId, user.id, isAdminLike);
  }

  const [updated] = await db.update(timeTracking).set({
    ...(payload.taskId !== undefined ? { taskId: payload.taskId } : {}),
    ...(payload.hours !== undefined ? { hours: payload.hours } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  }).where(eq(timeTracking.id, entryId)).returning();

  return apiSuccess(updated, 'Time entry updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const entryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new BadRequestError('Valid time entry id is required');
  }

  const [existing] = await db.select().from(timeTracking).where(eq(timeTracking.id, entryId)).limit(1);
  if (!existing) throw new NotFoundError('Time entry not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.userId !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this time entry');
  }

  const [deleted] = await db.delete(timeTracking).where(eq(timeTracking.id, entryId)).returning();
  return apiSuccess(deleted, 'Time entry deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
