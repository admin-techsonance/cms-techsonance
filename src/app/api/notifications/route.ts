import { NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createNotificationSchema, notificationTypeSchema, updateNotificationSchema } from '@/server/validation/internal-comms';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseNotificationRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;

  return {
    id: Number(row.id),
    userId,
    title: row.title,
    message: row.message,
    type: row.type,
    link: row.link ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const notificationId = Number(id);
      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        throw new BadRequestError('Valid notification id is required');
      }

      const { data: notification, error } = await supabase.from('notifications').select('*').eq('id', notificationId).single();
      if (error || !notification) throw new NotFoundError('Notification not found');
      if (!isAdminLike && notification.user_id !== actor.authUserId) throw new ForbiddenError('Notification not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(notification.user_id)].filter(Boolean));
      return NextResponse.json(normalizeSupabaseNotificationRow(notification, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const filterUserId = searchParams.get('userId');
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    let query = supabase.from('notifications').select('*', { count: 'exact' });

    if (isAdminLike && filterUserId) {
      const numericUserId = Number(filterUserId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        throw new BadRequestError('Valid user id is required');
      }
      query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericUserId));
    } else {
      query = query.eq('user_id', actor.authUserId);
    }
    if (type) query = query.eq('type', notificationTypeSchema.parse(type));
    if (isRead === 'true' || isRead === 'false') query = query.eq('is_read', isRead === 'true');

    const { data, count, error } = await query
      .order('created_at', { ascending: searchParams.get('order') === 'asc' })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabaseNotificationRow(row, userMap)),
      message: 'Notifications fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const targetUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId);
    const { data: created, error } = await supabase.from('notifications').insert({
      user_id: targetUserId,
      title: payload.title.trim(),
      message: payload.message.trim(),
      type: payload.type,
      link: payload.link?.trim() || null,
      is_read: false,
      created_at: new Date().toISOString(),
    }).select('*').single();

    if (error || !created) throw error ?? new Error('Failed to create notification');
    const userMap = await buildLegacyUserIdMap(accessToken, [targetUserId]);
    return NextResponse.json(normalizeSupabaseNotificationRow(created, userMap), { status: 201 });
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('notifications').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Notification not found');
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Notification not found');

    const { data: updated, error } = await supabase.from('notifications').update({
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.message !== undefined ? { message: payload.message.trim() } : {}),
      ...(payload.type !== undefined ? { type: payload.type } : {}),
      ...(payload.link !== undefined ? { link: payload.link?.trim() || null } : {}),
      ...(payload.isRead !== undefined ? { is_read: payload.isRead } : {}),
    }).eq('id', id).select('*').single();

    if (error || !updated) throw error ?? new Error('Failed to update notification');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.user_id)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseNotificationRow(updated, userMap));
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('notifications').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Notification not found');
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Notification not found');

    const { data: deleted, error } = await supabase.from('notifications').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete notification');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean));
    return NextResponse.json({
      message: 'Notification deleted successfully',
      notification: normalizeSupabaseNotificationRow(deleted, userMap),
    });
  }

  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Notification not found');
  if (!isAdminLike && existing.userId !== user.id) throw new ForbiddenError('Notification not found');
  const [deleted] = await db.delete(notifications).where(eq(notifications.id, id)).returning();
  return NextResponse.json({ message: 'Notification deleted successfully', notification: deleted });
}, { requireAuth: true, roles: ['Employee'] });
