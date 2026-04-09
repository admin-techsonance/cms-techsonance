import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { expenseCategories } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { expenseCategorySchema } from '@/server/validation/system';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const categoryId = Number(id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new BadRequestError('Valid expense category id is required');
    }

    const [category] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, categoryId)).limit(1);
    if (!category) throw new NotFoundError('Expense category not found');
    return apiSuccess(category, 'Expense category fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '100'), 1), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const [rows, countRows] = await Promise.all([
    db.select().from(expenseCategories).orderBy(asc(expenseCategories.name)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(expenseCategories),
  ]);

  return apiSuccess(rows, 'Expense categories fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = expenseCategorySchema.parse(await request.json());
  const [existing] = await db.select().from(expenseCategories).where(eq(expenseCategories.name, payload.name)).limit(1);
  if (existing) throw new ConflictError('Expense category already exists');

  const now = new Date().toISOString();
  const [created] = await db.insert(expenseCategories).values({
    name: payload.name,
    description: payload.description ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return apiSuccess(created, 'Expense category created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request) => {
  const categoryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new BadRequestError('Valid expense category id is required');
  }

  const [existing] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, categoryId)).limit(1);
  if (!existing) throw new NotFoundError('Expense category not found');

  const [deleted] = await db.delete(expenseCategories).where(eq(expenseCategories.id, categoryId)).returning();
  return apiSuccess(deleted, 'Expense category deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
