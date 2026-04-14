import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createInvoiceItemSchema, updateInvoiceItemSchema } from '@/server/validation/invoice-items';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseInvoiceItemRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: row.unit_price,
    amount: row.amount,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const invoiceId = searchParams.get('invoiceId');
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') ?? 'id';
  const ascending = searchParams.get('order') === 'asc';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new BadRequestError('Valid invoice item id is required');
    }
    const { data: record, error } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !record) throw new NotFoundError('Invoice item not found');
    return NextResponse.json(normalizeSupabaseInvoiceItemRow(record));
  }

  let query = supabase
    .from('invoice_items')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
    
  if (invoiceId) query = query.eq('invoice_id', Number(invoiceId));
  if (search) query = query.ilike('description', `%${search}%`);

  const sortColumn = sort === 'amount' ? 'amount' : sort === 'quantity' ? 'quantity' : 'id';
  const { data, count, error } = await query
    .order(sortColumn, { ascending })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  let totalAmount = 0;
  if (invoiceId) {
    const invoiceIdNumber = Number(invoiceId);
    const rowsForInvoice = ((data as Record<string, unknown>[] | null) ?? []).filter((row) => Number(row.invoice_id) === invoiceIdNumber);
    totalAmount = rowsForInvoice.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  }

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseInvoiceItemRow),
    message: 'Invoice items fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    ...(invoiceId ? { totalAmount } : {}),
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInvoiceItemSchema.parse(await request.json());

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
  const calculatedAmount = payload.quantity * payload.unitPrice;
  if (payload.amount !== undefined && payload.amount !== calculatedAmount) {
    throw new UnprocessableEntityError('Amount must equal quantity multiplied by unit price');
  }
  const { data: created, error } = await supabase.from('invoice_items').insert({
    invoice_id: payload.invoiceId,
    description: payload.description.trim(),
    quantity: payload.quantity,
    unit_price: payload.unitPrice,
    amount: calculatedAmount,
    tenant_id: tenantId,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create invoice item');
  return NextResponse.json(normalizeSupabaseInvoiceItemRow(created), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');
  const payload = updateInvoiceItemSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Invoice item not found');
  if (payload.invoiceId !== undefined) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', payload.invoiceId)
      .eq('tenant_id', tenantId)
      .single();
    if (!invoice) throw new NotFoundError('Invoice not found');
  }
  const quantity = payload.quantity ?? Number(existing.quantity);
  const unitPrice = payload.unitPrice ?? Number(existing.unit_price);
  const calculatedAmount = quantity * unitPrice;
  if (payload.amount !== undefined && payload.amount !== calculatedAmount) {
    throw new UnprocessableEntityError('Amount must equal quantity multiplied by unit price');
  }
  const { data: updated, error } = await supabase.from('invoice_items').update({
    ...(payload.invoiceId !== undefined ? { invoice_id: payload.invoiceId } : {}),
    ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
    ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
    ...(payload.unitPrice !== undefined ? { unit_price: payload.unitPrice } : {}),
    amount: calculatedAmount,
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update invoice item');
  return NextResponse.json(normalizeSupabaseInvoiceItemRow(updated));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('invoice_items')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw new NotFoundError('Invoice item not found');
  return NextResponse.json({ message: 'Invoice item deleted successfully', item: normalizeSupabaseInvoiceItemRow(deleted) });
}, { requireAuth: true, roles: ['Manager'] });
