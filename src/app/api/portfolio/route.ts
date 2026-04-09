import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { portfolio } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createPortfolioItemSchema, updatePortfolioItemSchema } from '@/server/validation/assets';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const portfolioId = Number(id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      throw new BadRequestError('Valid portfolio item id is required');
    }

    const [item] = await db.select().from(portfolio).where(eq(portfolio.id, portfolioId)).limit(1);
    if (!item) throw new NotFoundError('Portfolio item not found');
    return apiSuccess(item, 'Portfolio item fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const technology = searchParams.get('technology');
  const conditions = [];

  if (search) conditions.push(or(like(portfolio.title, `%${search}%`), like(portfolio.clientName, `%${search}%`))!);
  if (category) conditions.push(eq(portfolio.category, category));
  if (status) conditions.push(eq(portfolio.status, status));
  if (technology) conditions.push(like(portfolio.technologies, `%${technology}%`));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(portfolio);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(portfolio);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(portfolio.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Portfolio items fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createPortfolioItemSchema.parse(await request.json());
  const [created] = await db.insert(portfolio).values({
    title: payload.title,
    clientName: payload.clientName,
    category: payload.category,
    description: payload.description ?? null,
    projectUrl: payload.projectUrl ?? null,
    thumbnail: payload.thumbnail ?? null,
    images: payload.images ? JSON.stringify(payload.images) : null,
    technologies: payload.technologies ? JSON.stringify(payload.technologies) : null,
    status: 'active',
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Portfolio item created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const portfolioId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new BadRequestError('Valid portfolio item id is required');
  }

  const payload = updatePortfolioItemSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a portfolio item');
  }

  const [existing] = await db.select().from(portfolio).where(eq(portfolio.id, portfolioId)).limit(1);
  if (!existing) throw new NotFoundError('Portfolio item not found');

  const [updated] = await db.update(portfolio).set({
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.clientName !== undefined ? { clientName: payload.clientName } : {}),
    ...(payload.category !== undefined ? { category: payload.category } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.projectUrl !== undefined ? { projectUrl: payload.projectUrl } : {}),
    ...(payload.thumbnail !== undefined ? { thumbnail: payload.thumbnail } : {}),
    ...(payload.images !== undefined ? { images: payload.images ? JSON.stringify(payload.images) : null } : {}),
    ...(payload.technologies !== undefined ? { technologies: payload.technologies ? JSON.stringify(payload.technologies) : null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  }).where(eq(portfolio.id, portfolioId)).returning();

  return apiSuccess(updated, 'Portfolio item updated successfully');
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const portfolioId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new BadRequestError('Valid portfolio item id is required');
  }

  const [existing] = await db.select().from(portfolio).where(eq(portfolio.id, portfolioId)).limit(1);
  if (!existing) throw new NotFoundError('Portfolio item not found');

  const [deleted] = await db.delete(portfolio).where(eq(portfolio.id, portfolioId)).returning();
  return apiSuccess(deleted, 'Portfolio item deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
