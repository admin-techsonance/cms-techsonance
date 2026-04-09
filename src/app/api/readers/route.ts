import { and, asc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/db';
import { readerDevices } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { ConflictError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createReaderSchema, readerStatusSchema, readerTypeSchema } from '@/server/validation/devices';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const location = searchParams.get('location');
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

export const POST = withApiHandler(async (request) => {
  const payload = createReaderSchema.parse(await request.json());
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
