import { NextResponse } from 'next/server';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { blogs } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createBlogSchema, updateBlogSchema } from '@/server/validation/content';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseBlogRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const authorId = typeof row.author_id === 'string' ? userMap.get(row.author_id) ?? null : null;
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt ?? null,
    featuredImage: row.featured_image ?? null,
    authorId,
    category: row.category,
    tags: row.tags ?? null,
    status: row.status,
    views: Number(row.views ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    publishedAt: row.published_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const slug = searchParams.get('slug');
  const isAdminLike = context.auth?.user.role === 'Admin' || context.auth?.user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);

    if (id || slug) {
      let query = supabase.from('blogs').select('*');
      if (id) {
        query = query.eq('id', Number(id));
      } else {
        query = query.eq('slug', String(slug));
      }
      if (!isAdminLike) query = query.eq('author_id', actor.authUserId);

      const { data: blog, error } = await query.single();
      if (error || !blog) throw new NotFoundError('Blog not found');

      let currentBlog = blog;
      if (slug) {
        const { data: incremented } = await supabase
          .from('blogs')
          .update({ views: Number(blog.views ?? 0) + 1 })
          .eq('id', blog.id)
          .select('*')
          .single();
        if (incremented) currentBlog = incremented;
      }

      const userMap = await buildLegacyUserIdMap(accessToken, [String(currentBlog.author_id)].filter(Boolean));
      return NextResponse.json(normalizeSupabaseBlogRow(currentBlog, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const sort = searchParams.get('sort') ?? 'publishedAt';
    const ascending = searchParams.get('order') === 'asc';
    const search = searchParams.get('search');
    const authorId = searchParams.get('authorId');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');
    let query = supabase.from('blogs').select('*', { count: 'exact' });

    if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
    if (search) query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,content.ilike.%${search}%`);
    if (authorId) {
      const numericAuthorId = Number(authorId);
      if (!Number.isInteger(numericAuthorId) || numericAuthorId <= 0) {
        throw new BadRequestError('Valid author id is required');
      }
      query = query.eq('author_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericAuthorId));
    }
    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const sortColumn = sort === 'views' ? 'views' : sort === 'createdAt' ? 'created_at' : 'published_at';
    const { data, count, error } = await query
      .order(sortColumn, { ascending })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    let rows = (data as Record<string, unknown>[] | null) ?? [];
    if (tag) {
      rows = rows.filter((blog) => Array.isArray(blog.tags) && blog.tags.includes(tag));
    }

    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.author_id)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabaseBlogRow(row, userMap)),
      message: 'Blogs fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id || slug) {
    const conditions = [id ? eq(blogs.id, Number(id)) : eq(blogs.slug, String(slug))];
    if (!isAdminLike) conditions.push(eq(blogs.authorId, context.auth!.user.id));

    const [blog] = await db.select().from(blogs).where(and(...conditions)).limit(1);
    if (!blog) throw new NotFoundError('Blog not found');

    if (slug) {
      await db.update(blogs).set({ views: (blog.views || 0) + 1 }).where(eq(blogs.id, blog.id));
      blog.views = (blog.views || 0) + 1;
    }

    return NextResponse.json(blog);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const sort = searchParams.get('sort') ?? 'publishedAt';
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const search = searchParams.get('search');
  const authorId = searchParams.get('authorId');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const tag = searchParams.get('tag');
  const conditions = [];

  if (!isAdminLike) conditions.push(eq(blogs.authorId, context.auth!.user.id));
  if (search) conditions.push(or(like(blogs.title, `%${search}%`), like(blogs.excerpt, `%${search}%`), like(blogs.content, `%${search}%`)));
  if (authorId) conditions.push(eq(blogs.authorId, Number(authorId)));
  if (category) conditions.push(eq(blogs.category, category));
  if (status) conditions.push(eq(blogs.status, status));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(blogs);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(blogs);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  let results = await query.orderBy(
    sort === 'views' ? order(blogs.views) :
    sort === 'createdAt' ? order(blogs.createdAt) :
    order(blogs.publishedAt)
  ).limit(limit).offset(offset);

  if (tag) {
    results = results.filter((blog) => {
      try {
        const tags = typeof blog.tags === 'string' ? JSON.parse(blog.tags) : blog.tags;
        return Array.isArray(tags) && tags.includes(tag);
      } catch {
        return false;
      }
    });
  }

  const countRows = await countQuery;

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Blogs fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createBlogSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const normalizedSlug = payload.slug.trim();
    const { data: slugOwner } = await supabase.from('blogs').select('id').eq('slug', normalizedSlug).single();
    if (slugOwner) throw new ConflictError('Slug already exists');

    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('blogs').insert({
      title: payload.title.trim(),
      slug: normalizedSlug,
      content: payload.content.trim(),
      category: payload.category.trim(),
      excerpt: payload.excerpt?.trim() || null,
      featured_image: payload.featuredImage?.trim() || null,
      tags: payload.tags ?? null,
      status: payload.status ?? 'draft',
      author_id: actor.authUserId,
      views: 0,
      created_at: now,
      updated_at: now,
      published_at: (payload.status ?? 'draft') === 'published' ? now : null,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create blog');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return NextResponse.json(normalizeSupabaseBlogRow(created, userMap), { status: 201 });
  }

  const [slugOwner] = await db.select().from(blogs).where(eq(blogs.slug, payload.slug.trim())).limit(1);
  if (slugOwner) throw new ConflictError('Slug already exists');

  const now = new Date().toISOString();
  const [created] = await db.insert(blogs).values({
    title: payload.title.trim(),
    slug: payload.slug.trim(),
    content: payload.content.trim(),
    category: payload.category.trim(),
    excerpt: payload.excerpt?.trim() || null,
    featuredImage: payload.featuredImage?.trim() || null,
    tags: payload.tags ? JSON.stringify(payload.tags) : null,
    status: payload.status ?? 'draft',
    authorId: context.auth!.user.id,
    views: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: (payload.status ?? 'draft') === 'published' ? now : null,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid blog id is required');

  const payload = updateBlogSchema.parse(await request.json());
  const isAdminLike = context.auth?.user.role === 'Admin' || context.auth?.user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    let query = supabase.from('blogs').select('*').eq('id', id);
    if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
    const { data: existingBlog } = await query.single();
    if (!existingBlog) throw new NotFoundError('Blog not found');

    if (payload.slug && payload.slug !== existingBlog.slug) {
      const { data: slugOwner } = await supabase.from('blogs').select('id').eq('slug', payload.slug.trim()).single();
      if (slugOwner && Number(slugOwner.id) !== id) throw new ConflictError('Slug already exists');
    }

    const nextStatus = payload.status ?? existingBlog.status;
    const { data: updated, error } = await supabase.from('blogs').update({
      ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
      ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
      ...(payload.content !== undefined ? { content: payload.content.trim() } : {}),
      ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
      ...(payload.excerpt !== undefined ? { excerpt: payload.excerpt?.trim() || null } : {}),
      ...(payload.featuredImage !== undefined ? { featured_image: payload.featuredImage?.trim() || null } : {}),
      ...(payload.tags !== undefined ? { tags: payload.tags ?? null } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(nextStatus === 'published' && !existingBlog.published_at ? { published_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update blog');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.author_id)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseBlogRow(updated, userMap));
  }

  const conditions = [eq(blogs.id, id)];
  if (!isAdminLike) conditions.push(eq(blogs.authorId, context.auth!.user.id));

  const [existingBlog] = await db.select().from(blogs).where(and(...conditions)).limit(1);
  if (!existingBlog) throw new NotFoundError('Blog not found');

  if (payload.slug && payload.slug !== existingBlog.slug) {
    const [slugOwner] = await db.select().from(blogs).where(eq(blogs.slug, payload.slug)).limit(1);
    if (slugOwner && slugOwner.id !== id) throw new ConflictError('Slug already exists');
  }

  const nextStatus = payload.status ?? existingBlog.status;
  const [updated] = await db.update(blogs).set({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
    ...(payload.content !== undefined ? { content: payload.content.trim() } : {}),
    ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
    ...(payload.excerpt !== undefined ? { excerpt: payload.excerpt?.trim() || null } : {}),
    ...(payload.featuredImage !== undefined ? { featuredImage: payload.featuredImage?.trim() || null } : {}),
    ...(payload.tags !== undefined ? { tags: payload.tags ? JSON.stringify(payload.tags) : null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(nextStatus === 'published' && !existingBlog.publishedAt ? { publishedAt: new Date().toISOString() } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(blogs.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid blog id is required');

  const isAdminLike = context.auth?.user.role === 'Admin' || context.auth?.user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    let query = supabase.from('blogs').delete().eq('id', id).select('*');
    if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
    const { data: deleted, error } = await query.single();
    if (error || !deleted) throw new NotFoundError('Blog not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.author_id)].filter(Boolean));
    return NextResponse.json({ message: 'Blog deleted successfully', blog: normalizeSupabaseBlogRow(deleted, userMap) });
  }

  const conditions = [eq(blogs.id, id)];
  if (!isAdminLike) conditions.push(eq(blogs.authorId, context.auth!.user.id));

  const [deleted] = await db.delete(blogs).where(and(...conditions)).returning();
  if (!deleted) throw new NotFoundError('Blog not found');
  return NextResponse.json({ message: 'Blog deleted successfully', blog: deleted });
}, { requireAuth: true, roles: ['Employee'] });
