import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createInvoiceSchema, invoiceStatusSchema, updateInvoiceSchema } from '@/server/validation/billing';
import {
  getAdminRouteSupabase,
} from '@/server/supabase/route-helpers';

async function assertSupabaseInvoiceRelations(tenantId: string, input: { clientId?: number; projectId?: number | null }) {
  const supabase = getAdminRouteSupabase();
  if (input.clientId !== undefined) {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('id', input.clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Client not found');
  }
  if (input.projectId) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Project not found');
  }
}

function normalizeSupabaseInvoiceRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    clientId: Number(row.client_id),
    projectId: row.project_id === null ? null : Number(row.project_id),
    amount: row.amount,
    tax: row.tax,
    totalAmount: row.total_amount,
    status: row.status,
    dueDate: row.due_date,
    paidDate: row.paid_date ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    notes: row.notes ?? null,
    termsAndConditions: row.terms_and_conditions ?? null,
    paymentTerms: row.payment_terms ?? null,
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
      .from('invoices')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
      
    if (error || !data) throw new NotFoundError('Invoice not found');
    return NextResponse.json(normalizeSupabaseInvoiceRow(data));
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const clientId = searchParams.get('clientId');
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (search) query = query.ilike('invoice_number', `%${search}%`);
  if (clientId) query = query.eq('client_id', Number(clientId));
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (status) query = query.eq('status', invoiceStatusSchema.parse(status));
  if (startDate) query = query.gte('due_date', startDate);
  if (endDate) query = query.lte('due_date', endDate);
  const { data, count, error } = await query
    .order(sort === 'dueDate' ? 'due_date' : sort === 'totalAmount' ? 'total_amount' : 'created_at', { ascending })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return NextResponse.json({ success: true, data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseInvoiceRow), message: 'Invoices fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInvoiceSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  await assertSupabaseInvoiceRelations(tenantId, { clientId: payload.clientId, projectId: payload.projectId });
  
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('invoice_number', payload.invoiceNumber)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) throw new ConflictError('Invoice number already exists');
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('invoices').insert({
    invoice_number: payload.invoiceNumber,
    client_id: payload.clientId,
    project_id: payload.projectId ?? null,
    amount: payload.amount,
    tax: payload.tax,
    total_amount: payload.totalAmount,
    due_date: payload.dueDate,
    status: payload.status ?? 'draft',
    paid_date: payload.paidDate ?? null,
    notes: payload.notes ?? null,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to create invoice');
  return NextResponse.json(normalizeSupabaseInvoiceRow(data), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');
  const payload = updateInvoiceSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingInvoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingInvoice) throw new NotFoundError('Invoice not found');
  await assertSupabaseInvoiceRelations(tenantId, { clientId: payload.clientId, projectId: payload.projectId });
  
  if (payload.invoiceNumber && payload.invoiceNumber !== existingInvoice.invoice_number) {
    const { data: duplicate } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', payload.invoiceNumber)
      .eq('tenant_id', tenantId)
      .maybeSingle();
      
    if (duplicate) throw new ConflictError('Invoice number already exists');
  }
  const { data, error } = await supabase.from('invoices').update({
    ...(payload.invoiceNumber !== undefined ? { invoice_number: payload.invoiceNumber } : {}),
    ...(payload.clientId !== undefined ? { client_id: payload.clientId } : {}),
    ...(payload.projectId !== undefined ? { project_id: payload.projectId ?? null } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.tax !== undefined ? { tax: payload.tax } : {}),
    ...(payload.totalAmount !== undefined ? { total_amount: payload.totalAmount } : {}),
    ...(payload.dueDate !== undefined ? { due_date: payload.dueDate } : {}),
    ...(payload.paidDate !== undefined ? { paid_date: payload.paidDate ?? null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to update invoice');
  return NextResponse.json(normalizeSupabaseInvoiceRow(data));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw new NotFoundError('Invoice not found');
  return NextResponse.json({ message: 'Invoice deleted successfully', invoice: normalizeSupabaseInvoiceRow(data) });
}, { requireAuth: true, roles: ['Manager'] });
