import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clientCommunications, clients, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createClientCommunicationSchema, updateClientCommunicationSchema } from '@/server/validation/crm';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseClientCommunicationRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    userId,
    message: row.message,
    attachments: row.attachments ?? null,
    createdAt: row.created_at ?? null,
    isRead: Boolean(row.is_read ?? false),
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const communicationId = Number(id);
      if (!Number.isInteger(communicationId) || communicationId <= 0) throw new BadRequestError('Valid communication id is required');
      const { data: communication, error } = await supabase.from('client_communications').select('*').eq('id', communicationId).single();
      if (error || !communication) throw new NotFoundError('Client communication not found');
      if (!isAdminLike && communication.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to view this communication');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(communication.user_id)].filter(Boolean));
      return apiSuccess(normalizeSupabaseClientCommunicationRow(communication, userMap), 'Client communication fetched successfully');
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const clientIdParam = searchParams.get('clientId');
    const userIdParam = searchParams.get('userId');
    const isRead = searchParams.get('isRead');
    let query = supabase.from('client_communications').select('*', { count: 'exact' });

    if (clientIdParam) {
      const clientId = Number(clientIdParam);
      if (!Number.isInteger(clientId) || clientId <= 0) throw new BadRequestError('Valid client id is required');
      query = query.eq('client_id', clientId);
    }

    if (isAdminLike && userIdParam) {
      const requestedUserId = Number(userIdParam);
      if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) throw new BadRequestError('Valid user id is required');
      query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, requestedUserId));
    } else if (!isAdminLike) {
      query = query.eq('user_id', actor.authUserId);
    }

    if (isRead !== null) query = query.eq('is_read', isRead === 'true' || isRead === '1');

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return apiSuccess(rows.map((row) => normalizeSupabaseClientCommunicationRow(row, userMap)), 'Client communications fetched successfully', {
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id) {
    const communicationId = Number(id);
    if (!Number.isInteger(communicationId) || communicationId <= 0) {
      throw new BadRequestError('Valid communication id is required');
    }

    const [communication] = await db.select().from(clientCommunications).where(eq(clientCommunications.id, communicationId)).limit(1);
    if (!communication) {
      throw new NotFoundError('Client communication not found');
    }
    if (!isAdminLike && communication.userId !== user.id) {
      throw new ForbiddenError('You do not have permission to view this communication');
    }

    return apiSuccess(communication, 'Client communication fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const clientIdParam = searchParams.get('clientId');
  const userIdParam = searchParams.get('userId');
  const isRead = searchParams.get('isRead');
  const conditions = [];

  if (clientIdParam) {
    const clientId = Number(clientIdParam);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw new BadRequestError('Valid client id is required');
    }
    conditions.push(eq(clientCommunications.clientId, clientId));
  }

  if (isAdminLike && userIdParam) {
    const requestedUserId = Number(userIdParam);
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }
    conditions.push(eq(clientCommunications.userId, requestedUserId));
  } else if (!isAdminLike) {
    conditions.push(eq(clientCommunications.userId, user.id));
  }

  if (isRead !== null) {
    conditions.push(eq(clientCommunications.isRead, isRead === 'true' || isRead === '1'));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(clientCommunications);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(clientCommunications);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(clientCommunications.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Client communications fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createClientCommunicationSchema.parse(await request.json());
  const user = context.auth!.user;
  const requestedUserId = payload.userId ?? user.id;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const targetAuthUserId = isAdminLike && payload.userId
      ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId)
      : actor.authUserId;
    if (!isAdminLike && targetAuthUserId !== actor.authUserId) {
      throw new ForbiddenError('You can only create communications for your own user');
    }
    const [{ data: client }, { data: communicationUser }] = await Promise.all([
      supabase.from('clients').select('id').eq('id', payload.clientId).single(),
      supabase.from('users').select('id').eq('id', targetAuthUserId).single(),
    ]);
    if (!client) throw new NotFoundError('Client not found');
    if (!communicationUser) throw new NotFoundError('User not found');
    const { data, error } = await supabase.from('client_communications').insert({
      client_id: payload.clientId,
      user_id: targetAuthUserId,
      message: payload.message,
      attachments: payload.attachments ?? null,
      created_at: new Date().toISOString(),
      is_read: false,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create client communication');
    const userMap = await buildLegacyUserIdMap(accessToken, [targetAuthUserId]);
    return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication created successfully', { status: 201 });
  }

  if (!isAdminLike && requestedUserId !== user.id) {
    throw new ForbiddenError('You can only create communications for your own user');
  }

  const [[client], [communicationUser]] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, payload.clientId)).limit(1),
    db.select().from(users).where(eq(users.id, requestedUserId)).limit(1),
  ]);

  if (!client) throw new NotFoundError('Client not found');
  if (!communicationUser) throw new NotFoundError('User not found');

  const [created] = await db.insert(clientCommunications).values({
    clientId: payload.clientId,
    userId: requestedUserId,
    message: payload.message,
    attachments: payload.attachments ?? null,
    createdAt: new Date().toISOString(),
    isRead: false,
  }).returning();

  return apiSuccess(created, 'Client communication created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const communicationId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(communicationId) || communicationId <= 0) {
    throw new BadRequestError('Valid communication id is required');
  }

  const payload = updateClientCommunicationSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a client communication');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('client_communications').select('*').eq('id', communicationId).single();
    if (!existing) throw new NotFoundError('Client communication not found');
    const user = context.auth!.user;
    const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to update this communication');
    const { data, error } = await supabase.from('client_communications').update({
      ...(payload.message !== undefined ? { message: payload.message } : {}),
      ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
      ...(payload.isRead !== undefined ? { is_read: payload.isRead } : {}),
    }).eq('id', communicationId).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update client communication');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean));
    return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication updated successfully');
  }

  const [existing] = await db.select().from(clientCommunications).where(eq(clientCommunications.id, communicationId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Client communication not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.userId !== user.id) {
    throw new ForbiddenError('You do not have permission to update this communication');
  }

  const [updated] = await db.update(clientCommunications).set({
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
    ...(payload.isRead !== undefined ? { isRead: payload.isRead } : {}),
  }).where(eq(clientCommunications.id, communicationId)).returning();

  return apiSuccess(updated, 'Client communication updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const communicationId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(communicationId) || communicationId <= 0) {
    throw new BadRequestError('Valid communication id is required');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('client_communications').select('*').eq('id', communicationId).single();
    if (!existing) throw new NotFoundError('Client communication not found');
    const user = context.auth!.user;
    const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to delete this communication');
    const { data, error } = await supabase.from('client_communications').delete().eq('id', communicationId).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to delete client communication');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean));
    return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication deleted successfully');
  }

  const [existing] = await db.select().from(clientCommunications).where(eq(clientCommunications.id, communicationId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Client communication not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.userId !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this communication');
  }

  const [deleted] = await db.delete(clientCommunications).where(eq(clientCommunications.id, communicationId)).returning();
  return apiSuccess(deleted, 'Client communication deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
