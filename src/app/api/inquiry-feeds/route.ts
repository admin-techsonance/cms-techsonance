import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { inquiries, inquiryFeeds } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createInquiryFeedSchema, updateInquiryFeedSchema } from '@/server/validation/crm';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const feedId = Number(id);
    if (!Number.isInteger(feedId) || feedId <= 0) {
      throw new BadRequestError('Valid inquiry feed id is required');
    }

    const [feed] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
    if (!feed) {
      throw new NotFoundError('Inquiry feed not found');
    }

    return apiSuccess(feed, 'Inquiry feed fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const inquiryIdParam = searchParams.get('inquiryId');
  const conditions = [];

  if (inquiryIdParam) {
    const inquiryId = Number(inquiryIdParam);
    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
      throw new BadRequestError('Valid inquiry id is required');
    }
    conditions.push(eq(inquiryFeeds.inquiryId, inquiryId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(inquiryFeeds);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(inquiryFeeds);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(asc(inquiryFeeds.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Inquiry feeds fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInquiryFeedSchema.parse(await request.json());
  const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, payload.inquiryId)).limit(1);
  if (!inquiry) {
    throw new NotFoundError('Inquiry not found');
  }

  const [created] = await db.insert(inquiryFeeds).values({
    inquiryId: payload.inquiryId,
    commentedBy: context.auth!.user.id,
    technology: payload.technology ?? null,
    description: payload.description,
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Inquiry feed created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  const payload = updateInquiryFeedSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update an inquiry feed');
  }

  const [existing] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry feed not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commentedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to update this inquiry feed');
  }

  const [updated] = await db.update(inquiryFeeds).set({
    ...(payload.technology !== undefined ? { technology: payload.technology } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  }).where(eq(inquiryFeeds.id, feedId)).returning();

  return apiSuccess(updated, 'Inquiry feed updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const feedId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new BadRequestError('Valid inquiry feed id is required');
  }

  const [existing] = await db.select().from(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).limit(1);
  if (!existing) {
    throw new NotFoundError('Inquiry feed not found');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.commentedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this inquiry feed');
  }

  const [deleted] = await db.delete(inquiryFeeds).where(eq(inquiryFeeds.id, feedId)).returning();
  return apiSuccess(deleted, 'Inquiry feed deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
