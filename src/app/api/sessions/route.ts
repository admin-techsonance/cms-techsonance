import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createSessionSchema, updateSessionSchema } from '@/server/validation/system';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseSessionRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    userId,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const userIdParam = searchParams.get('userId');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const sessionId = Number(id);
      if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
      const { data: session, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      if (error || !session) throw new NotFoundError('Session not found');
      if (!isAdminLike && session.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to view this session');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(session.user_id)].filter(Boolean));
      return apiSuccess(normalizeSupabaseSessionRow(session, userMap), 'Session fetched successfully');
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    let query = supabase.from('sessions').select('*', { count: 'exact' });
    if (userIdParam) {
      const requestedUserId = Number(userIdParam);
      if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) throw new BadRequestError('Valid user id is required');
      if (!isAdminLike && requestedUserId !== user.id) throw new ForbiddenError('You can only list your own sessions');
      query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, requestedUserId));
    } else if (!isAdminLike) {
      query = query.eq('user_id', actor.authUserId);
    }
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return apiSuccess(rows.map((row) => normalizeSupabaseSessionRow(row, userMap)), 'Sessions fetched successfully', {
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

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

export const POST = withApiHandler(async (request, context) => {
  const payload = createSessionSchema.parse(await request.json());
  if (new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId);
    const [[userExists], [tokenExists]] = await Promise.all([
      supabase.from('users').select('id').eq('id', authUserId).single(),
      supabase.from('sessions').select('id').eq('token', payload.token).single(),
    ]);
    if (!userExists.data) throw new NotFoundError('User not found');
    if (tokenExists.data) throw new ConflictError('Session token already exists');
    const { data: created, error } = await supabase.from('sessions').insert({
      user_id: authUserId,
      token: payload.token,
      expires_at: new Date(payload.expiresAt).toISOString(),
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create session');
    const userMap = await buildLegacyUserIdMap(accessToken, [authUserId]);
    return apiSuccess(normalizeSupabaseSessionRow(created, userMap), 'Session created successfully', { status: 201 });
  }

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

export const PUT = withApiHandler(async (request, context) => {
  const sessionId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
  const payload = updateSessionSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) throw new BadRequestError('At least one field is required to update a session');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    if (!existing) throw new NotFoundError('Session not found');
    if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');
    let authUserId: string | undefined;
    if (payload.userId !== undefined) {
      authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId);
      const { data: userExists } = await supabase.from('users').select('id').eq('id', authUserId).single();
      if (!userExists) throw new NotFoundError('User not found');
    }
    if (payload.token !== undefined) {
      const { data: tokenExists } = await supabase.from('sessions').select('id').eq('token', payload.token).single();
      if (tokenExists && Number(tokenExists.id) !== sessionId) throw new ConflictError('Session token already exists');
    }
    const { data: updated, error } = await supabase.from('sessions').update({
      ...(authUserId !== undefined ? { user_id: authUserId } : {}),
      ...(payload.token !== undefined ? { token: payload.token } : {}),
      ...(payload.expiresAt !== undefined ? { expires_at: new Date(payload.expiresAt).toISOString() } : {}),
    }).eq('id', sessionId).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update session');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.user_id)].filter(Boolean));
    return apiSuccess(normalizeSupabaseSessionRow(updated, userMap), 'Session updated successfully');
  }

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
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    if (!existing) throw new NotFoundError('Session not found');
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to delete this session');
    const { data: deleted, error } = await supabase.from('sessions').delete().eq('id', sessionId).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete session');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean));
    return apiSuccess(normalizeSupabaseSessionRow(deleted, userMap), 'Session deleted successfully');
  }

  const [existing] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!existing) throw new NotFoundError('Session not found');

  if (!isAdminLike && existing.userId !== user.id) throw new ForbiddenError('You do not have permission to delete this session');

  const [deleted] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning();
  return apiSuccess(deleted, 'Session deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
