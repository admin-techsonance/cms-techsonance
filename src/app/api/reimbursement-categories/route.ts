import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError } from '@/server/http/errors';
import { reimbursementCategorySchema } from '@/server/validation/reimbursements';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseReimbursementCategory(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    maxAmount: row.max_amount ?? null,
    isActive: Boolean(row.is_active ?? true),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('reimbursement_categories')
    .select('*')
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (error) throw error;
  return NextResponse.json(((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseReimbursementCategory));
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = reimbursementCategorySchema.parse(await request.json());
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('reimbursement_categories')
    .select('id')
    .eq('name', payload.name)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) throw new ConflictError('Category with this name already exists');
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('reimbursement_categories').insert({
    name: payload.name,
    description: payload.description ?? null,
    max_amount: payload.maxAmount ?? null,
    is_active: true,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create reimbursement category');
  return NextResponse.json(normalizeSupabaseReimbursementCategory(data), { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Category ID is required');
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  await supabase
    .from('reimbursement_categories')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return NextResponse.json({ message: 'Category deactivated successfully' });
}, { requireAuth: true, roles: ['Admin'] });
