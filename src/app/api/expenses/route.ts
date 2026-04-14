import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createExpenseSchema, expenseStatusSchema, updateExpenseSchema } from '@/server/validation/expenses';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

async function assertSupabaseExpenseRelations(tenantId: string, input: { projectId?: number | null; employeeId?: number | null }) {
  const supabase = getAdminRouteSupabase();
  if (input.projectId) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Project not found');
  }
  if (input.employeeId) {
    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('id', input.employeeId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Employee not found');
  }
}

function normalizeSupabaseExpenseRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    category: row.category,
    description: row.description,
    amount: row.amount,
    date: row.date,
    projectId: row.project_id === null ? null : Number(row.project_id),
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    receiptUrl: row.receipt_url ?? null,
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
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Expense not found');
    return NextResponse.json(normalizeSupabaseExpenseRow(data));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const employeeId = searchParams.get('employeeId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const aggregateBy = searchParams.get('aggregateBy');
  const sortField = searchParams.get('sort') ?? 'createdAt';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) query = query.or(`category.ilike.%${search}%,description.ilike.%${search}%`);
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (employeeId) query = query.eq('employee_id', Number(employeeId));
  if (status) query = query.eq('status', expenseStatusSchema.parse(status));
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, count, error } = await query
    .order(sortField === 'date' ? 'date' : sortField === 'amount' ? 'amount' : sortField === 'category' ? 'category' : 'created_at', { ascending })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseExpenseRow);

  if (aggregateBy === 'category') {
    const grouped = Object.values(rows.reduce<Record<string, { category: string; totalAmount: number; count: number }>>((acc, row) => {
      const key = String(row.category);
      acc[key] ??= { category: key, totalAmount: 0, count: 0 };
      acc[key].totalAmount += Number(row.amount ?? 0);
      acc[key].count += 1;
      return acc;
    }, {}));
    return NextResponse.json(grouped);
  }

  if (aggregateBy === 'project') {
    const grouped = Object.values(rows.reduce<Record<string, { projectId: number | null; totalAmount: number; count: number }>>((acc, row) => {
      const key = String(row.projectId ?? 'null');
      acc[key] ??= { projectId: row.projectId, totalAmount: 0, count: 0 };
      acc[key].totalAmount += Number(row.amount ?? 0);
      acc[key].count += 1;
      return acc;
    }, {}));
    return NextResponse.json(grouped);
  }

  return NextResponse.json({
    success: true,
    data: rows,
    message: 'Expenses fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createExpenseSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  await assertSupabaseExpenseRelations(tenantId, payload);
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('expenses').insert({
    category: payload.category.trim(),
    description: payload.description.trim(),
    amount: payload.amount,
    date: payload.date,
    project_id: payload.projectId ?? null,
    employee_id: payload.employeeId ?? null,
    receipt_url: payload.receiptUrl?.trim() || null,
    status: payload.status ?? 'pending',
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();

  if (error || !data) throw error ?? new Error('Failed to create expense');
  return NextResponse.json(normalizeSupabaseExpenseRow(data), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');
  const payload = updateExpenseSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Expense not found');
  await assertSupabaseExpenseRelations(tenantId, { projectId: payload.projectId, employeeId: payload.employeeId });

  const { data, error } = await supabase.from('expenses').update({
    ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.projectId !== undefined ? { project_id: payload.projectId ?? null } : {}),
    ...(payload.employeeId !== undefined ? { employee_id: payload.employeeId ?? null } : {}),
    ...(payload.receiptUrl !== undefined ? { receipt_url: payload.receiptUrl?.trim() || null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw error ?? new Error('Failed to update expense');
  return NextResponse.json(normalizeSupabaseExpenseRow(data));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw new NotFoundError('Expense not found');
  return NextResponse.json({ message: 'Expense deleted successfully', expense: normalizeSupabaseExpenseRow(data) });
}, { requireAuth: true, roles: ['Manager'] });
