import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createSessionSchema, updateSessionSchema } from '@/server/validation/system';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const userIdParam = searchParams.get('userId');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  if (id) {
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    if (!session) throw new NotFoundError('Session not found');
    if (!isAdminLike && session.userId !== user.id) throw new ForbiddenError('You do not have permission to view this session');
    return apiSuccess(session, 'Session fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const conditions = [];
  if (userIdParam) {
    const requestedUserId = Number(userIdParam);
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) throw new BadRequestError('Valid user id is required');
    if (!isAdminLike && requestedUserId !== user.id) throw new ForbiddenError('You can only list your own sessions');
    conditions.push(eq(sessions.userId, requestedUserId));
  } else if (!isAdminLike) {
    conditions.push(eq(sessions.userId, user.id));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(sessions);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(sessions);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(sessions.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Sessions fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createSessionSchema.parse(await request.json());
  if (new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');

  const [[userExists], [tokenExists]] = await Promise.all([
    db.select().from(users).where(eq(users.id, payload.userId)).limit(1),
    db.select().from(sessions).where(eq(sessions.token, payload.token)).limit(1),
  ]);
  if (!userExists) throw new NotFoundError('User not found');
  if (tokenExists) throw new ConflictError('Session token already exists');

  const [created] = await db.insert(sessions).values({
    userId: payload.userId,
    token: payload.token,
    expiresAt: new Date(payload.expiresAt).toISOString(),
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Session created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request) => {
  const sessionId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
  const payload = updateSessionSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) throw new BadRequestError('At least one field is required to update a session');

  const [existing] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!existing) throw new NotFoundError('Session not found');
  if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');

  if (payload.userId !== undefined) {
    const [userExists] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!userExists) throw new NotFoundError('User not found');
  }
  if (payload.token !== undefined) {
    const [tokenExists] = await db.select().from(sessions).where(eq(sessions.token, payload.token)).limit(1);
    if (tokenExists && tokenExists.id !== sessionId) throw new ConflictError('Session token already exists');
  }

  const [updated] = await db.update(sessions).set({
    ...(payload.userId !== undefined ? { userId: payload.userId } : {}),
    ...(payload.token !== undefined ? { token: payload.token } : {}),
    ...(payload.expiresAt !== undefined ? { expiresAt: new Date(payload.expiresAt).toISOString() } : {}),
  }).where(eq(sessions.id, sessionId)).returning();

  return apiSuccess(updated, 'Session updated successfully');
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const sessionId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');

  const [existing] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!existing) throw new NotFoundError('Session not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  if (!isAdminLike && existing.userId !== user.id) throw new ForbiddenError('You do not have permission to delete this session');

  const [deleted] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning();
  return apiSuccess(deleted, 'Session deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
