import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clientCommunications, clients, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createClientCommunicationSchema, updateClientCommunicationSchema } from '@/server/validation/crm';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

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
