import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { pages } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createPageSchema, updatePageSchema } from '@/server/validation/content';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const slug = searchParams.get('slug');

  if (id || slug) {
    const [page] = await db.select().from(pages).where(id ? eq(pages.id, Number(id)) : eq(pages.slug, String(slug))).limit(1);
    if (!page) throw new NotFoundError('Page not found');
    return NextResponse.json(page);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const createdBy = searchParams.get('createdBy');
  const conditions = [];

  if (search) conditions.push(or(like(pages.title, `%${search}%`), like(pages.slug, `%${search}%`)));
  if (status) conditions.push(eq(pages.status, status));
  if (createdBy) conditions.push(eq(pages.createdBy, Number(createdBy)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(pages);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(pages);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query.orderBy(desc(pages.updatedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Pages fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Viewer'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPageSchema.parse(await request.json());
  const [existingSlug] = await db.select().from(pages).where(eq(pages.slug, payload.slug.trim())).limit(1);
  if (existingSlug) throw new ConflictError('Slug already exists. Please use a unique slug');

  const now = new Date().toISOString();
  const [created] = await db.insert(pages).values({
    title: payload.title.trim(),
    slug: payload.slug.trim(),
    content: payload.content ?? null,
    metaTitle: payload.metaTitle?.trim() || null,
    metaDescription: payload.metaDescription?.trim() || null,
    metaKeywords: payload.metaKeywords?.trim() || null,
    status: payload.status ?? 'draft',
    createdBy: context.auth!.user.id,
    createdAt: now,
    updatedAt: now,
    publishedAt: (payload.status ?? 'draft') === 'published' ? now : null,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid page id is required');

  const payload = updatePageSchema.parse(await request.json());
  const [existingPage] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!existingPage) throw new NotFoundError('Page not found');

  if (payload.slug && payload.slug !== existingPage.slug) {
    const [slugOwner] = await db.select().from(pages).where(eq(pages.slug, payload.slug)).limit(1);
    if (slugOwner && slugOwner.id !== id) throw new ConflictError('Slug already exists. Please use a unique slug');
  }

  const nextStatus = payload.status ?? existingPage.status;
  const [updated] = await db.update(pages).set({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
    ...(payload.content !== undefined ? { content: payload.content ?? null } : {}),
    ...(payload.metaTitle !== undefined ? { metaTitle: payload.metaTitle?.trim() || null } : {}),
    ...(payload.metaDescription !== undefined ? { metaDescription: payload.metaDescription?.trim() || null } : {}),
    ...(payload.metaKeywords !== undefined ? { metaKeywords: payload.metaKeywords?.trim() || null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(nextStatus === 'published' && !existingPage.publishedAt ? { publishedAt: new Date().toISOString() } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(pages.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid page id is required');

  const [deleted] = await db.delete(pages).where(eq(pages.id, id)).returning();
  if (!deleted) throw new NotFoundError('Page not found');
  return NextResponse.json({ message: 'Page deleted successfully', page: deleted });
}, { requireAuth: true, roles: ['Admin'] });

