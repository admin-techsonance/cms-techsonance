import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/server/http/errors';
import { createReimbursementSchema, updateReimbursementSchema } from '@/server/validation/reimbursements';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
} from '@/server/supabase/route-helpers';

function generateRequestId() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RMB-${year}-${random}`;
}

function normalizeSupabaseReimbursementRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const reviewedBy = typeof row.reviewed_by === 'string' ? userMap.get(row.reviewed_by) ?? null : null;
  return {
    id: Number(row.id),
    requestId: row.request_id,
    employeeId: Number(row.employee_id),
    categoryId: Number(row.category_id),
    amount: row.amount,
    currency: row.currency ?? 'INR',
    expenseDate: row.expense_date,
    description: row.description,
    receiptUrl: row.receipt_url ?? null,
    status: row.status,
    submittedAt: row.submitted_at ?? null,
    reviewedBy,
    reviewedAt: row.reviewed_at ?? null,
    adminComments: row.admin_comments ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const currentUser = context.auth!.user;
  const isAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const categoryId = searchParams.get('categoryId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const minAmount = searchParams.get('minAmount');
  const maxAmount = searchParams.get('maxAmount');
  const employeeIdParam = searchParams.get('employeeId');
  const search = searchParams.get('search');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  let query = supabase
    .from('reimbursements')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) query = query.or(`request_id.ilike.%${search}%,description.ilike.%${search}%`);
  if (!isAdminLike) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!employee) return NextResponse.json([]);
    query = query.eq('employee_id', employee.id);
  } else if (employeeIdParam) {
    query = query.eq('employee_id', Number(employeeIdParam));
  }
  if (status) query = query.eq('status', status);
  if (categoryId) query = query.eq('category_id', Number(categoryId));
  if (startDate) query = query.gte('expense_date', startDate);
  if (endDate) query = query.lte('expense_date', endDate);
  if (minAmount) query = query.gte('amount', Number(minAmount));
  if (maxAmount) query = query.lte('amount', Number(maxAmount));

  const { data, count, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.reviewed_by)).filter(Boolean), tenantId);
  return NextResponse.json({ success: true, data: rows.map((row) => normalizeSupabaseReimbursementRow(row, userMap)), message: 'Reimbursements fetched successfully', errors: null, meta: { page: 1, limit: rows.length || 0, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createReimbursementSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', actor.authUserId)
    .eq('tenant_id', tenantId)
    .single();
  if (!employee) throw new NotFoundError('Employee record not found');
  const { data: category } = await supabase
    .from('reimbursement_categories')
    .select('id')
    .eq('id', payload.categoryId)
    .eq('tenant_id', tenantId)
    .single();
  if (!category) throw new NotFoundError('Reimbursement category not found');

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('reimbursements').insert({
    request_id: generateRequestId(),
    employee_id: employee.id,
    category_id: payload.categoryId,
    amount: payload.amount,
    currency: 'INR',
    expense_date: payload.expenseDate,
    description: payload.description,
    receipt_url: payload.receiptUrl ?? null,
    status: payload.status ?? 'draft',
    tenant_id: tenantId,
    submitted_at: (payload.status ?? 'draft') === 'submitted' ? now : null,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create reimbursement');
  return NextResponse.json(normalizeSupabaseReimbursementRow(data, new Map()), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Reimbursement ID is required');
  const payload = updateReimbursementSchema.parse(await request.json());
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existing } = await supabase.from('reimbursements').select('*').eq('id', id).eq('tenant_id', tenantId).single();
  if (!existing) throw new NotFoundError('Reimbursement not found');
  if (!isAdminLike) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!employee || Number(existing.employee_id) !== Number(employee.id)) throw new ForbiddenError('Unauthorized to update this reimbursement');
    if (existing.status !== 'draft') throw new BadRequestError('Can only edit draft reimbursements');
  }
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (!isAdminLike) {
    if (payload.categoryId !== undefined) updates.category_id = payload.categoryId;
    if (payload.amount !== undefined) updates.amount = payload.amount;
    if (payload.expenseDate !== undefined) updates.expense_date = payload.expenseDate;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.receiptUrl !== undefined) updates.receipt_url = payload.receiptUrl ?? null;
    if (payload.status !== undefined) {
      updates.status = payload.status;
      if (payload.status === 'submitted') updates.submitted_at = now;
    }
  } else {
    if (payload.status !== undefined) {
      updates.status = payload.status;
      updates.reviewed_by = actor.authUserId;
      updates.reviewed_at = now;
    }
    if (payload.adminComments !== undefined) updates.admin_comments = payload.adminComments ?? null;
  }
  const { data, error } = await supabase
    .from('reimbursements')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to update reimbursement');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.reviewed_by)].filter(Boolean), tenantId);
  return NextResponse.json(normalizeSupabaseReimbursementRow(data, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Reimbursement ID is required');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existing } = await supabase.from('reimbursements').select('*').eq('id', id).eq('tenant_id', tenantId).single();
  if (!existing) throw new NotFoundError('Reimbursement not found');
  if (!isAdminLike) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!employee || Number(existing.employee_id) !== Number(employee.id)) throw new ForbiddenError('Unauthorized to delete this reimbursement');
    if (existing.status !== 'draft') throw new BadRequestError('Can only delete draft reimbursements');
  }
  await supabase
    .from('reimbursements')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return NextResponse.json({ message: 'Reimbursement deleted successfully' });
}, { requireAuth: true, roles: ['Employee'] });
