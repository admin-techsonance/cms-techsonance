import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { pages } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createPageSchema, updatePageSchema } from '@/server/validation/content';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabasePageRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const createdBy = typeof row.created_by === 'string' ? userMap.get(row.created_by) ?? null : null;
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    content: row.content ?? null,
    metaTitle: row.meta_title ?? null,
    metaDescription: row.meta_description ?? null,
    metaKeywords: row.meta_keywords ?? null,
    status: row.status,
    createdBy,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    publishedAt: row.published_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const slug = searchParams.get('slug');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id || slug) {
      let query = supabase.from('pages').select('*');
      if (id) {
        query = query.eq('id', Number(id));
      } else {
        query = query.eq('slug', String(slug));
      }
      const { data: page, error } = await query.single();
      if (error || !page) throw new NotFoundError('Page not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(page.created_by)].filter(Boolean));
      return NextResponse.json(normalizeSupabasePageRow(page, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const createdBy = searchParams.get('createdBy');
    let query = supabase.from('pages').select('*', { count: 'exact' });

    if (search) query = query.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
    if (status) query = query.eq('status', status);
    if (createdBy) {
      const numericCreatedBy = Number(createdBy);
      if (!Number.isInteger(numericCreatedBy) || numericCreatedBy <= 0) {
        throw new BadRequestError('Valid createdBy user id is required');
      }
      query = query.eq('created_by', await resolveAuthUserIdFromLegacyUserId(accessToken, numericCreatedBy));
    }

    const { data, count, error } = await query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.created_by)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabasePageRow(row, userMap)),
      message: 'Pages fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const normalizedSlug = payload.slug.trim();
    const { data: existingSlug } = await supabase.from('pages').select('id').eq('slug', normalizedSlug).single();
    if (existingSlug) throw new ConflictError('Slug already exists. Please use a unique slug');

    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('pages').insert({
      title: payload.title.trim(),
      slug: normalizedSlug,
      content: payload.content ?? null,
      meta_title: payload.metaTitle?.trim() || null,
      meta_description: payload.metaDescription?.trim() || null,
      meta_keywords: payload.metaKeywords?.trim() || null,
      status: payload.status ?? 'draft',
      created_by: actor.authUserId,
      created_at: now,
      updated_at: now,
      published_at: (payload.status ?? 'draft') === 'published' ? now : null,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create page');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return NextResponse.json(normalizeSupabasePageRow(created, userMap), { status: 201 });
  }

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

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid page id is required');

  const payload = updatePageSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existingPage } = await supabase.from('pages').select('*').eq('id', id).single();
    if (!existingPage) throw new NotFoundError('Page not found');

    if (payload.slug && payload.slug !== existingPage.slug) {
      const { data: slugOwner } = await supabase.from('pages').select('id').eq('slug', payload.slug.trim()).single();
      if (slugOwner && Number(slugOwner.id) !== id) throw new ConflictError('Slug already exists. Please use a unique slug');
    }

    const nextStatus = payload.status ?? existingPage.status;
    const { data: updated, error } = await supabase.from('pages').update({
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
      ...(payload.content !== undefined ? { content: payload.content ?? null } : {}),
      ...(payload.metaTitle !== undefined ? { meta_title: payload.metaTitle?.trim() || null } : {}),
      ...(payload.metaDescription !== undefined ? { meta_description: payload.metaDescription?.trim() || null } : {}),
      ...(payload.metaKeywords !== undefined ? { meta_keywords: payload.metaKeywords?.trim() || null } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(nextStatus === 'published' && !existingPage.published_at ? { published_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update page');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.created_by)].filter(Boolean));
    return NextResponse.json(normalizeSupabasePageRow(updated, userMap));
  }

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

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid page id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('pages').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw new NotFoundError('Page not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.created_by)].filter(Boolean));
    return NextResponse.json({ message: 'Page deleted successfully', page: normalizeSupabasePageRow(deleted, userMap) });
  }

  const [deleted] = await db.delete(pages).where(eq(pages.id, id)).returning();
  if (!deleted) throw new NotFoundError('Page not found');
  return NextResponse.json({ message: 'Page deleted successfully', page: deleted });
}, { requireAuth: true, roles: ['Admin'] });
