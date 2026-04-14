import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPaymentSchema, updatePaymentSchema } from '@/server/validation/billing';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabasePaymentRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    amount: row.amount,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    transactionId: row.transaction_id ?? null,
    notes: row.notes ?? null,
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
      .from('payments')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Payment not found');
    return NextResponse.json(normalizeSupabasePaymentRow(data));
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const invoiceId = searchParams.get('invoiceId');
  const paymentMethod = searchParams.get('paymentMethod');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (invoiceId) query = query.eq('invoice_id', Number(invoiceId));
  if (paymentMethod) query = query.eq('payment_method', paymentMethod);
  if (startDate) query = query.gte('payment_date', startDate);
  if (endDate) query = query.lte('payment_date', endDate);
  if (search) query = query.or(`payment_method.ilike.%${search}%,transaction_id.ilike.%${search}%,notes.ilike.%${search}%`);
  const { data, count, error } = await query
    .order(sort === 'paymentDate' ? 'payment_date' : 'created_at', { ascending })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return NextResponse.json({ success: true, data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabasePaymentRow), message: 'Payments fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPaymentSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', payload.invoiceId)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!invoice) throw new NotFoundError('Invoice not found');
  const { data, error } = await supabase.from('payments').insert({
    invoice_id: payload.invoiceId,
    amount: payload.amount,
    payment_method: payload.paymentMethod,
    payment_date: payload.paymentDate,
    transaction_id: payload.transactionId ?? null,
    notes: payload.notes ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create payment');
  return NextResponse.json(normalizeSupabasePaymentRow(data), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');
  const payload = updatePaymentSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('payments').update({
    ...(payload.paymentMethod !== undefined ? { payment_method: payload.paymentMethod } : {}),
    ...(payload.transactionId !== undefined ? { transaction_id: payload.transactionId ?? null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw new NotFoundError('Payment not found');
  return NextResponse.json(normalizeSupabasePaymentRow(data));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase
    .from('payments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw new NotFoundError('Payment not found');
  return NextResponse.json({ message: 'Payment deleted successfully', payment: normalizeSupabasePaymentRow(data) });
}, { requireAuth: true, roles: ['Manager'] });
