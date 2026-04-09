import { NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createNotificationSchema, notificationTypeSchema, updateNotificationSchema } from '@/server/validation/internal-comms';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, Number(id))).limit(1);
    if (!notification) throw new NotFoundError('Notification not found');
    if (!isAdminLike && notification.userId !== user.id) throw new ForbiddenError('Notification not found');
    return NextResponse.json(notification);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const filterUserId = searchParams.get('userId');
  const type = searchParams.get('type');
  const isRead = searchParams.get('isRead');
  const sortOrder = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = [eq(notifications.userId, isAdminLike && filterUserId ? Number(filterUserId) : user.id)];
  if (type) conditions.push(eq(notifications.type, notificationTypeSchema.parse(type)));
  if (isRead === 'true' || isRead === 'false') conditions.push(eq(notifications.isRead, isRead === 'true'));
  let query = db.select().from(notifications).where(and(...conditions));
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(...conditions));
  const [rows, countRows] = await Promise.all([query.orderBy(sortOrder(notifications.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Notifications fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createNotificationSchema.parse(await request.json());
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) throw new NotFoundError('User not found');
  const [created] = await db.insert(notifications).values({
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    link: payload.link ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid notification id is required');
  const payload = updateNotificationSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Notification not found');
  if (!isAdminLike && existing.userId !== user.id) throw new ForbiddenError('Notification not found');
  const [updated] = await db.update(notifications).set({
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    ...(payload.type !== undefined ? { type: payload.type } : {}),
    ...(payload.link !== undefined ? { link: payload.link ?? null } : {}),
    ...(payload.isRead !== undefined ? { isRead: payload.isRead } : {}),
  }).where(eq(notifications.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid notification id is required');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Notification not found');
  if (!isAdminLike && existing.userId !== user.id) throw new ForbiddenError('Notification not found');
  const [deleted] = await db.delete(notifications).where(eq(notifications.id, id)).returning();
  return NextResponse.json({ message: 'Notification deleted successfully', notification: deleted });
}, { requireAuth: true, roles: ['Employee'] });

