import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createBlogSchema, updateBlogSchema } from '@/server/validation/content';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
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

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id || slug) {
    let query = supabase.from('blogs').select('*').eq('tenant_id', tenantId);
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
        .eq('tenant_id', tenantId)
        .select('*')
        .single();
      if (incremented) currentBlog = incremented;
    }

    const userMap = await buildLegacyUserIdMap(accessToken, [String(currentBlog.author_id)].filter(Boolean), tenantId);
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
  let query = supabase
    .from('blogs')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
  if (search) query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%,content.ilike.%${search}%`);
  if (authorId) {
    const numericAuthorId = Number(authorId);
    if (!Number.isInteger(numericAuthorId) || numericAuthorId <= 0) {
      throw new BadRequestError('Valid author id is required');
    }
    query = query.eq('author_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericAuthorId, tenantId));
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

  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.author_id)).filter(Boolean), tenantId);
  return NextResponse.json({
    success: true,
    data: rows.map((row) => normalizeSupabaseBlogRow(row, userMap)),
    message: 'Blogs fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createBlogSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const normalizedSlug = payload.slug.trim();
  const { data: slugOwner } = await supabase.from('blogs').select('id').eq('slug', normalizedSlug).eq('tenant_id', tenantId).single();
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
    tenant_id: tenantId,
    views: 0,
    created_at: now,
    updated_at: now,
    published_at: (payload.status ?? 'draft') === 'published' ? now : null,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create blog');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseBlogRow(created, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid blog id is required');

  const payload = updateBlogSchema.parse(await request.json());
  const isAdminLike = context.auth?.user.role === 'Admin' || context.auth?.user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  let query = supabase.from('blogs').select('*').eq('id', id).eq('tenant_id', tenantId);
  if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
  const { data: existingBlog } = await query.single();
  if (!existingBlog) throw new NotFoundError('Blog not found');

  if (payload.slug && payload.slug !== existingBlog.slug) {
    const { data: slugOwner } = await supabase.from('blogs').select('id').eq('slug', payload.slug.trim()).eq('tenant_id', tenantId).single();
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
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update blog');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.author_id)].filter(Boolean), tenantId);
  return NextResponse.json(normalizeSupabaseBlogRow(updated, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid blog id is required');

  const isAdminLike = context.auth?.user.role === 'Admin' || context.auth?.user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  let query = supabase.from('blogs').delete().eq('id', id).eq('tenant_id', tenantId).select('*');
  if (!isAdminLike) query = query.eq('author_id', actor.authUserId);
  const { data: deleted, error } = await query.single();
  if (error || !deleted) throw new NotFoundError('Blog not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.author_id)].filter(Boolean), tenantId);
  return NextResponse.json({ message: 'Blog deleted successfully', blog: normalizeSupabaseBlogRow(deleted, userMap) });
}, { requireAuth: true, roles: ['Employee'] });
