import { NextResponse } from 'next/server';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/db';
import { invoiceItems, invoices } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createInvoiceItemSchema, updateInvoiceItemSchema } from '@/server/validation/invoice-items';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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
  const sortOrder = ascending ? asc : desc;

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const itemId = Number(id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new BadRequestError('Valid invoice item id is required');
      }
      const { data: record, error } = await supabase.from('invoice_items').select('*').eq('id', itemId).single();
      if (error || !record) throw new NotFoundError('Invoice item not found');
      return NextResponse.json(normalizeSupabaseInvoiceItemRow(record));
    }

    let query = supabase.from('invoice_items').select('*', { count: 'exact' });
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
  }

  if (id) {
    const [record] = await db.select().from(invoiceItems).where(eq(invoiceItems.id, Number(id))).limit(1);
    if (!record) throw new NotFoundError('Invoice item not found');
    return NextResponse.json(record);
  }

  const conditions = [];
  if (invoiceId) conditions.push(eq(invoiceItems.invoiceId, Number(invoiceId)));
  if (search) conditions.push(like(invoiceItems.description, `%${search}%`));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(invoiceItems);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(invoiceItems);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const sortColumn = sort === 'amount' ? invoiceItems.amount : sort === 'quantity' ? invoiceItems.quantity : invoiceItems.id;
  const [rows, countRows] = await Promise.all([query.orderBy(sortOrder(sortColumn)).limit(limit).offset(offset), countQuery]);
  const aggregation = invoiceId ? await db.select({ total: sql<number>`coalesce(sum(${invoiceItems.amount}),0)` }).from(invoiceItems).where(eq(invoiceItems.invoiceId, Number(invoiceId))) : null;
  return NextResponse.json({ success: true, data: rows, message: 'Invoice items fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) }, ...(aggregation ? { totalAmount: aggregation[0]?.total ?? 0 } : {}) });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInvoiceItemSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: invoice } = await supabase.from('invoices').select('id').eq('id', payload.invoiceId).single();
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
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create invoice item');
    return NextResponse.json(normalizeSupabaseInvoiceItemRow(created), { status: 201 });
  }

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payload.invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Invoice not found');
  const calculatedAmount = payload.quantity * payload.unitPrice;
  if (payload.amount !== undefined && payload.amount !== calculatedAmount) throw new UnprocessableEntityError('Amount must equal quantity multiplied by unit price');
  const [created] = await db.insert(invoiceItems).values({
    invoiceId: payload.invoiceId,
    description: payload.description,
    quantity: payload.quantity,
    unitPrice: payload.unitPrice,
    amount: calculatedAmount,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');
  const payload = updateInvoiceItemSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('invoice_items').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Invoice item not found');
    if (payload.invoiceId !== undefined) {
      const { data: invoice } = await supabase.from('invoices').select('id').eq('id', payload.invoiceId).single();
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
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update invoice item');
    return NextResponse.json(normalizeSupabaseInvoiceItemRow(updated));
  }

  const [existing] = await db.select().from(invoiceItems).where(eq(invoiceItems.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Invoice item not found');
  if (payload.invoiceId !== undefined) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payload.invoiceId)).limit(1);
    if (!invoice) throw new NotFoundError('Invoice not found');
  }
  const quantity = payload.quantity ?? existing.quantity;
  const unitPrice = payload.unitPrice ?? existing.unitPrice;
  const calculatedAmount = quantity * unitPrice;
  if (payload.amount !== undefined && payload.amount !== calculatedAmount) throw new UnprocessableEntityError('Amount must equal quantity multiplied by unit price');
  const [updated] = await db.update(invoiceItems).set({
    ...(payload.invoiceId !== undefined ? { invoiceId: payload.invoiceId } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
    ...(payload.unitPrice !== undefined ? { unitPrice: payload.unitPrice } : {}),
    amount: calculatedAmount,
  }).where(eq(invoiceItems.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('invoice_items').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw new NotFoundError('Invoice item not found');
    return NextResponse.json({ message: 'Invoice item deleted successfully', item: normalizeSupabaseInvoiceItemRow(deleted) });
  }

  const [deleted] = await db.delete(invoiceItems).where(eq(invoiceItems.id, id)).returning();
  if (!deleted) throw new NotFoundError('Invoice item not found');
  return NextResponse.json({ message: 'Invoice item deleted successfully', item: deleted });
}, { requireAuth: true, roles: ['Manager'] });
