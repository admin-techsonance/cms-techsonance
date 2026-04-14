import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { expenseCategorySchema } from '@/server/validation/system';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseExpenseCategoryRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
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
    const categoryId = Number(id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw new BadRequestError('Valid expense category id is required');
    }

    const { data: category, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !category) throw new NotFoundError('Expense category not found');
    return apiSuccess(normalizeSupabaseExpenseCategoryRow(category), 'Expense category fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '100'), 1), 200);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const { data, count, error } = await supabase
    .from('expense_categories')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return apiSuccess(
    ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseExpenseCategoryRow),
    'Expense categories fetched successfully',
    { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = expenseCategorySchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const normalizedName = payload.name.trim();
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('name', normalizedName)
    .eq('tenant_id', tenantId)
    .single();
  if (existing) throw new ConflictError('Expense category already exists');

  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('expense_categories').insert({
    name: normalizedName,
    description: payload.description?.trim() || null,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create expense category');
  return apiSuccess(normalizeSupabaseExpenseCategoryRow(created), 'Expense category created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const categoryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new BadRequestError('Valid expense category id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Expense category not found');

  const { data: deleted, error } = await supabase
    .from('expense_categories')
    .delete()
    .eq('id', categoryId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete expense category');
  return apiSuccess(normalizeSupabaseExpenseCategoryRow(deleted), 'Expense category deleted successfully');
}, { requireAuth: true, roles: ['Admin'] });
