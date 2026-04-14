import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createPortfolioItemSchema, updatePortfolioItemSchema } from '@/server/validation/assets';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabasePortfolioRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    title: row.title,
    clientName: row.client_name,
    category: row.category,
    description: row.description ?? null,
    projectUrl: row.project_url ?? null,
    thumbnail: row.thumbnail ?? null,
    images: row.images ?? null,
    technologies: row.technologies ?? null,
    status: row.status,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();

  if (id) {
    const portfolioId = Number(id);
    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      throw new BadRequestError('Valid portfolio item id is required');
    }

    const { data: item, error } = await supabase
      .from('portfolio')
      .select('*')
      .eq('id', portfolioId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !item) throw new NotFoundError('Portfolio item not found');
    return apiSuccess(normalizeSupabasePortfolioRow(item), 'Portfolio item fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const technology = searchParams.get('technology');
  let query = supabase
    .from('portfolio')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) query = query.or(`title.ilike.%${search}%,client_name.ilike.%${search}%`);
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);
  if (technology) query = query.contains('technologies', [technology]);

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return apiSuccess(
    ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabasePortfolioRow),
    'Portfolio items fetched successfully',
    { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPortfolioItemSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: created, error } = await supabase.from('portfolio').insert({
    title: payload.title.trim(),
    client_name: payload.clientName.trim(),
    category: payload.category.trim(),
    description: payload.description?.trim() || null,
    project_url: payload.projectUrl?.trim() || null,
    thumbnail: payload.thumbnail?.trim() || null,
    images: payload.images ?? null,
    technologies: payload.technologies ?? null,
    status: 'active',
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();

  if (error || !created) throw error ?? new Error('Failed to create portfolio item');
  return apiSuccess(normalizeSupabasePortfolioRow(created), 'Portfolio item created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const portfolioId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new BadRequestError('Valid portfolio item id is required');
  }

  const payload = updatePortfolioItemSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a portfolio item');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('portfolio')
    .select('id')
    .eq('id', portfolioId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Portfolio item not found');

  const { data: updated, error } = await supabase.from('portfolio').update({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.clientName !== undefined ? { client_name: payload.clientName.trim() } : {}),
    ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.projectUrl !== undefined ? { project_url: payload.projectUrl?.trim() || null } : {}),
    ...(payload.thumbnail !== undefined ? { thumbnail: payload.thumbnail?.trim() || null } : {}),
    ...(payload.images !== undefined ? { images: payload.images ?? null } : {}),
    ...(payload.technologies !== undefined ? { technologies: payload.technologies ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  })
  .eq('id', portfolioId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !updated) throw error ?? new Error('Failed to update portfolio item');
  return apiSuccess(normalizeSupabasePortfolioRow(updated), 'Portfolio item updated successfully');
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const portfolioId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new BadRequestError('Valid portfolio item id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('portfolio')
    .select('id')
    .eq('id', portfolioId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Portfolio item not found');

  const { data: deleted, error } = await supabase
    .from('portfolio')
    .delete()
    .eq('id', portfolioId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete portfolio item');
  return apiSuccess(normalizeSupabasePortfolioRow(deleted), 'Portfolio item deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
