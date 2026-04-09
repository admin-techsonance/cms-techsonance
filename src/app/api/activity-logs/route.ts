import { NextResponse } from 'next/server';
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { activityLogs, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createActivityLogSchema } from '@/server/validation/admin-logs';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [record] = await db.select().from(activityLogs).where(eq(activityLogs.id, Number(id))).limit(1);
    if (!record) throw new NotFoundError('Activity log not found');
    return NextResponse.json(record);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const userId = searchParams.get('userId');
  const action = searchParams.get('action');
  const module = searchParams.get('module');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const conditions = [];
  if (userId) conditions.push(eq(activityLogs.userId, Number(userId)));
  if (action) conditions.push(eq(activityLogs.action, action));
  if (module) conditions.push(eq(activityLogs.module, module));
  if (startDate) conditions.push(gte(activityLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(activityLogs.createdAt, endDate));
  if (search) conditions.push(or(like(activityLogs.action, `%${search}%`), like(activityLogs.module, `%${search}%`)));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(activityLogs);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(activityLogs);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(activityLogs.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Activity logs fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request) => {
  const payload = createActivityLogSchema.parse(await request.json());
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) throw new NotFoundError('User with specified userId does not exist');
  const [created] = await db.insert(activityLogs).values({
    userId: payload.userId,
    action: payload.action,
    module: payload.module,
    details: payload.details ?? null,
    ipAddress: payload.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid activity log id is required');
  const [deleted] = await db.delete(activityLogs).where(eq(activityLogs.id, id)).returning();
  if (!deleted) throw new NotFoundError('Activity log not found');
  return NextResponse.json({ message: 'Activity log deleted successfully', deletedRecord: deleted });
}, { requireAuth: true, roles: ['Admin'] });

