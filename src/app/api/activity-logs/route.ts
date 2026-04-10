import { NextResponse } from 'next/server';
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { activityLogs, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createActivityLogSchema } from '@/server/validation/admin-logs';
import {
  buildLegacyUserIdMap,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseActivityLogRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;

  return {
    id: Number(row.id),
    userId,
    action: row.action,
    module: row.module,
    details: row.details ?? null,
    ipAddress: row.ip_address ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const recordId = Number(id);
      if (!Number.isInteger(recordId) || recordId <= 0) {
        throw new BadRequestError('Valid activity log id is required');
      }

      const { data: record, error } = await supabase.from('activity_logs').select('*').eq('id', recordId).single();
      if (error || !record) throw new NotFoundError('Activity log not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(record.user_id)].filter(Boolean));
      return NextResponse.json(normalizeSupabaseActivityLogRow(record, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const module = searchParams.get('module');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    let query = supabase.from('activity_logs').select('*', { count: 'exact' });

    if (userId) {
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        throw new BadRequestError('Valid user id is required');
      }
      query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericUserId));
    }
    if (action) query = query.eq('action', action);
    if (module) query = query.eq('module', module);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (search) query = query.or(`action.ilike.%${search}%,module.ilike.%${search}%`);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabaseActivityLogRow(row, userMap)),
      message: 'Activity logs fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

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

export const POST = withApiHandler(async (request, context) => {
  const payload = createActivityLogSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId);
    const { data: created, error } = await supabase.from('activity_logs').insert({
      user_id: authUserId,
      action: payload.action.trim(),
      module: payload.module.trim(),
      details: payload.details ?? null,
      ip_address: payload.ipAddress ?? null,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create activity log');
    const userMap = await buildLegacyUserIdMap(accessToken, [authUserId]);
    return NextResponse.json(normalizeSupabaseActivityLogRow(created, userMap), { status: 201 });
  }

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

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid activity log id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('activity_logs').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw new NotFoundError('Activity log not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean));
    return NextResponse.json({
      message: 'Activity log deleted successfully',
      deletedRecord: normalizeSupabaseActivityLogRow(deleted, userMap),
    });
  }

  const [deleted] = await db.delete(activityLogs).where(eq(activityLogs.id, id)).returning();
  if (!deleted) throw new NotFoundError('Activity log not found');
  return NextResponse.json({ message: 'Activity log deleted successfully', deletedRecord: deleted });
}, { requireAuth: true, roles: ['Admin'] });
