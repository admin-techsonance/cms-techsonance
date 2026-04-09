import { and, desc, eq, gte, like, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { inquiries } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createInquirySchema, updateInquirySchema } from '@/server/validation/crm';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const inquiryId = Number(id);
    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
      throw new BadRequestError('Valid inquiry id is required');
    }

    const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId)).limit(1);
    if (!inquiry) {
      throw new NotFoundError('Inquiry not found');
    }

    return apiSuccess(inquiry, 'Inquiry fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const tag = searchParams.get('tag');
  const status = searchParams.get('status');
  const appStatus = searchParams.get('appStatus');
  const isFavourite = searchParams.get('isFavourite');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const conditions = [];

  if (search) conditions.push(like(inquiries.aliasName, `%${search}%`));
  if (tag) conditions.push(eq(inquiries.tag, tag));
  if (status) conditions.push(eq(inquiries.status, status));
  if (appStatus) conditions.push(eq(inquiries.appStatus, appStatus));
  if (isFavourite !== null) conditions.push(eq(inquiries.isFavourite, isFavourite === 'true' || isFavourite === '1'));
  if (startDate) conditions.push(gte(inquiries.createdAt, startDate));
  if (endDate) conditions.push(lte(inquiries.createdAt, endDate));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(inquiries);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(inquiries);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(inquiries.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Inquiries fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInquirySchema.parse(await request.json());
  const now = new Date().toISOString();
  const [created] = await db.insert(inquiries).values({
    aliasName: payload.aliasName,
    tag: payload.tag,
    status: payload.status,
    dueDate: payload.dueDate ?? null,
    appStatus: payload.appStatus ?? 'open',
    isFavourite: payload.isFavourite ?? false,
    createdBy: context.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return apiSuccess(created, 'Inquiry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request) => {
  const inquiryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    throw new BadRequestError('Valid inquiry id is required');
  }

  const payload = updateInquirySchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update an inquiry');
  }

  const [existing] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry not found');
  }

  const [updated] = await db.update(inquiries).set({
    ...(payload.aliasName !== undefined ? { aliasName: payload.aliasName } : {}),
    ...(payload.tag !== undefined ? { tag: payload.tag } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate } : {}),
    ...(payload.appStatus !== undefined ? { appStatus: payload.appStatus } : {}),
    ...(payload.isFavourite !== undefined ? { isFavourite: payload.isFavourite } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(inquiries.id, inquiryId)).returning();

  return apiSuccess(updated, 'Inquiry updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request) => {
  const inquiryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    throw new BadRequestError('Valid inquiry id is required');
  }

  const [existing] = await db.select().from(inquiries).where(eq(inquiries.id, inquiryId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry not found');
  }

  const [updated] = await db.update(inquiries).set({
    appStatus: 'close',
    updatedAt: new Date().toISOString(),
  }).where(eq(inquiries.id, inquiryId)).returning();

  return apiSuccess(updated, 'Inquiry closed successfully');
}, { requireAuth: true, roles: ['Employee'] });
