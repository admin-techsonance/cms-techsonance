import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { reimbursementCategories } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError } from '@/server/http/errors';
import { reimbursementCategorySchema } from '@/server/validation/reimbursements';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('reimbursement_categories').select('*').eq('is_active', true).order('name', { ascending: true });
    if (error) throw error;
    return NextResponse.json(((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseReimbursementCategory));
  }
  const categories = await db.select().from(reimbursementCategories).where(eq(reimbursementCategories.isActive, true)).orderBy(asc(reimbursementCategories.name));
  return NextResponse.json(categories);
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = reimbursementCategorySchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('reimbursement_categories').select('id').eq('name', payload.name).maybeSingle();
    if (existing) throw new ConflictError('Category with this name already exists');
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('reimbursement_categories').insert({
      name: payload.name,
      description: payload.description ?? null,
      max_amount: payload.maxAmount ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create reimbursement category');
    return NextResponse.json(normalizeSupabaseReimbursementCategory(data), { status: 201 });
  }
  const [existing] = await db.select().from(reimbursementCategories).where(eq(reimbursementCategories.name, payload.name)).limit(1);
  if (existing) throw new ConflictError('Category with this name already exists');
  const now = new Date().toISOString();
  const [created] = await db.insert(reimbursementCategories).values({
    name: payload.name,
    description: payload.description ?? null,
    maxAmount: payload.maxAmount ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Category ID is required');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    await supabase.from('reimbursement_categories').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ message: 'Category deactivated successfully' });
  }
  await db.update(reimbursementCategories).set({ isActive: false, updatedAt: new Date().toISOString() }).where(eq(reimbursementCategories.id, id));
  return NextResponse.json({ message: 'Category deactivated successfully' });
}, { requireAuth: true, roles: ['Admin'] });
