import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, performanceReviews, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPerformanceReviewSchema, updatePerformanceReviewSchema } from '@/server/validation/hr';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [review] = await db.select().from(performanceReviews).where(eq(performanceReviews.id, Number(id))).limit(1);
    if (!review) throw new NotFoundError('Performance review not found');
    return NextResponse.json(review);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const employeeId = searchParams.get('employeeId');
  const reviewerId = searchParams.get('reviewerId');
  const rating = searchParams.get('rating');
  const reviewPeriod = searchParams.get('reviewPeriod');
  const conditions = [];
  if (employeeId) conditions.push(eq(performanceReviews.employeeId, Number(employeeId)));
  if (reviewerId) conditions.push(eq(performanceReviews.reviewerId, Number(reviewerId)));
  if (rating) conditions.push(eq(performanceReviews.rating, Number(rating)));
  if (reviewPeriod) conditions.push(eq(performanceReviews.reviewPeriod, reviewPeriod));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(performanceReviews);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(performanceReviews);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(performanceReviews.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Performance reviews fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Manager'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPerformanceReviewSchema.parse(await request.json());
  const [employee] = await db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1);
  if (!employee) throw new NotFoundError('Employee not found');
  const reviewerId = payload.reviewerId ?? context.auth!.user.id;
  const [reviewer] = await db.select().from(users).where(eq(users.id, reviewerId)).limit(1);
  if (!reviewer) throw new NotFoundError('Reviewer not found');
  const [created] = await db.insert(performanceReviews).values({
    employeeId: payload.employeeId,
    reviewerId,
    rating: payload.rating,
    reviewPeriod: payload.reviewPeriod,
    comments: payload.comments ?? null,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid performance review id is required');
  const payload = updatePerformanceReviewSchema.parse(await request.json());
  const [updated] = await db.update(performanceReviews).set({
    ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
    ...(payload.reviewPeriod !== undefined ? { reviewPeriod: payload.reviewPeriod } : {}),
    ...(payload.comments !== undefined ? { comments: payload.comments ?? null } : {}),
  }).where(eq(performanceReviews.id, id)).returning();
  if (!updated) throw new NotFoundError('Performance review not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid performance review id is required');
  const [deleted] = await db.delete(performanceReviews).where(eq(performanceReviews.id, id)).returning();
  if (!deleted) throw new NotFoundError('Performance review not found');
  return NextResponse.json({ message: 'Performance review deleted successfully', review: deleted });
}, { requireAuth: true, roles: ['Manager'] });

