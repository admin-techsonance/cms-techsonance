import { and, asc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createReaderSchema, readerStatusSchema, readerTypeSchema } from '@/server/validation/devices';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseReaderRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    readerId: row.reader_id,
    name: row.name,
    location: row.location,
    type: row.type,
    status: row.status,
    ipAddress: row.ip_address ?? null,
    config: row.config ?? null,
    lastHeartbeat: row.last_heartbeat ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const location = searchParams.get('location');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    let query = getRouteSupabase(accessToken).from('reader_devices').select('*', { count: 'exact' });
    if (status) query = query.eq('status', readerStatusSchema.parse(status));
    if (type) query = query.eq('type', readerTypeSchema.parse(type));
    if (location) query = query.ilike('location', `%${location}%`);
    const { data, count, error } = await query.order('name', { ascending: true }).range(offset, offset + limit - 1);
    if (error) throw error;
    return apiSuccess(((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseReaderRow), 'Reader devices fetched successfully', {
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  const conditions = [];

  if (status) conditions.push(eq(readerDevices.status, readerStatusSchema.parse(status)));
  if (type) conditions.push(eq(readerDevices.type, readerTypeSchema.parse(type)));
  if (location) conditions.push(like(readerDevices.location, `%${location}%`));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(readerDevices);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(readerDevices);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(asc(readerDevices.name)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Reader devices fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createReaderSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('reader_devices').select('id').eq('reader_id', payload.readerId).single();
    if (existing) throw new ConflictError('A reader device with this readerId already exists');
    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('reader_devices').insert({
      reader_id: payload.readerId.trim(),
      name: payload.name.trim(),
      location: payload.location.trim(),
      type: payload.type,
      status: 'offline',
      ip_address: payload.ipAddress?.trim() || null,
      config: payload.config ?? null,
      last_heartbeat: null,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create reader device');
    return apiSuccess(normalizeSupabaseReaderRow(created), 'Reader device created successfully', { status: 201 });
  }

  const [existing] = await db.select().from(readerDevices).where(eq(readerDevices.readerId, payload.readerId)).limit(1);
  if (existing) {
    throw new ConflictError('A reader device with this readerId already exists');
  }

  const now = new Date().toISOString();
  const [created] = await db.insert(readerDevices).values({
    readerId: payload.readerId,
    name: payload.name,
    location: payload.location,
    type: payload.type,
    status: 'offline',
    ipAddress: payload.ipAddress ?? null,
    config: payload.config == null ? null : typeof payload.config === 'string' ? payload.config : JSON.stringify(payload.config),
    lastHeartbeat: null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return apiSuccess(created, 'Reader device created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });
