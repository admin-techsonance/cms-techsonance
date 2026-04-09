import { NextResponse } from 'next/server';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { chatMessages, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createChatMessageSchema, updateChatMessageSchema } from '@/server/validation/internal-comms';

export const GET = withApiHandler(async (request, context) => {
  const userId = context.auth!.user.id;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const [message] = await db.select().from(chatMessages).where(and(eq(chatMessages.id, Number(id)), or(eq(chatMessages.senderId, userId), eq(chatMessages.receiverId, userId)))).limit(1);
    if (!message) throw new NotFoundError('Chat message not found');
    return NextResponse.json(message);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const senderId = searchParams.get('senderId');
  const receiverId = searchParams.get('receiverId');
  const roomId = searchParams.get('roomId');
  const isRead = searchParams.get('isRead');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const order = searchParams.get('order') === 'desc' ? desc : asc;
  const conditions = [or(eq(chatMessages.senderId, userId), eq(chatMessages.receiverId, userId))];
  if (senderId) conditions.push(eq(chatMessages.senderId, Number(senderId)));
  if (receiverId) conditions.push(eq(chatMessages.receiverId, Number(receiverId)));
  if (roomId) conditions.push(eq(chatMessages.roomId, roomId));
  if (isRead === 'true' || isRead === 'false') conditions.push(eq(chatMessages.isRead, isRead === 'true'));
  let query = db.select().from(chatMessages).where(and(...conditions));
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(chatMessages).where(and(...conditions));
  const [rows, countRows] = await Promise.all([query.orderBy(sort === 'createdAt' ? order(chatMessages.createdAt) : order(chatMessages.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Chat messages fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createChatMessageSchema.parse(await request.json());
  if (payload.receiverId) {
    const [receiver] = await db.select().from(users).where(eq(users.id, payload.receiverId)).limit(1);
    if (!receiver) throw new NotFoundError('Receiver user not found');
  }
  const [created] = await db.insert(chatMessages).values({
    senderId: context.auth!.user.id,
    receiverId: payload.receiverId ?? null,
    roomId: payload.roomId ?? null,
    message: payload.message,
    attachments: payload.attachments ?? null,
    createdAt: new Date().toISOString(),
    isRead: false,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid chat message id is required');
  const payload = updateChatMessageSchema.parse(await request.json());
  const [existing] = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Chat message not found');
  if (payload.message !== undefined && existing.senderId !== context.auth!.user.id) throw new ForbiddenError('Only the sender can edit the message content');
  if (payload.isRead !== undefined && existing.receiverId !== context.auth!.user.id && existing.senderId !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  const [updated] = await db.update(chatMessages).set({
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    ...(payload.isRead !== undefined ? { isRead: payload.isRead } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments ?? null } : {}),
  }).where(eq(chatMessages.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid chat message id is required');
  const [existing] = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Chat message not found');
  if (existing.senderId !== context.auth!.user.id) throw new ForbiddenError('Only the sender can delete a chat message');
  const [deleted] = await db.delete(chatMessages).where(eq(chatMessages.id, id)).returning();
  return NextResponse.json({ message: 'Chat message deleted successfully', data: deleted });
}, { requireAuth: true, roles: ['Employee'] });

