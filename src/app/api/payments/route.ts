import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { invoices, payments } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPaymentSchema, updatePaymentSchema } from '@/server/validation/billing';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      const { data, error } = await supabase.from('payments').select('*').eq('id', Number(id)).single();
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
    let query = supabase.from('payments').select('*', { count: 'exact' });
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
  }
  if (id) {
    const [payment] = await db.select().from(payments).where(eq(payments.id, Number(id))).limit(1);
    if (!payment) throw new NotFoundError('Payment not found');
    return NextResponse.json(payment);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const invoiceId = searchParams.get('invoiceId');
  const paymentMethod = searchParams.get('paymentMethod');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const sort = searchParams.get('sort') ?? 'createdAt';
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = [];
  if (invoiceId) conditions.push(eq(payments.invoiceId, Number(invoiceId)));
  if (paymentMethod) conditions.push(eq(payments.paymentMethod, paymentMethod));
  if (startDate) conditions.push(gte(payments.paymentDate, startDate));
  if (endDate) conditions.push(lte(payments.paymentDate, endDate));
  if (search) conditions.push(or(like(payments.paymentMethod, `%${search}%`), like(payments.transactionId, `%${search}%`), like(payments.notes, `%${search}%`)));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(payments);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(payments);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }
  const sortColumn = sort === 'paymentDate' ? payments.paymentDate : payments.createdAt;
  const [rows, countRows] = await Promise.all([query.orderBy(order(sortColumn)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Payments fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createPaymentSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: invoice } = await supabase.from('invoices').select('id').eq('id', payload.invoiceId).single();
    if (!invoice) throw new NotFoundError('Invoice not found');
    const { data, error } = await supabase.from('payments').insert({
      invoice_id: payload.invoiceId,
      amount: payload.amount,
      payment_method: payload.paymentMethod,
      payment_date: payload.paymentDate,
      transaction_id: payload.transactionId ?? null,
      notes: payload.notes ?? null,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create payment');
    return NextResponse.json(normalizeSupabasePaymentRow(data), { status: 201 });
  }
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, payload.invoiceId)).limit(1);
  if (!invoice) throw new NotFoundError('Invoice not found');
  const [created] = await db.insert(payments).values({
    invoiceId: payload.invoiceId,
    amount: payload.amount,
    paymentMethod: payload.paymentMethod,
    paymentDate: payload.paymentDate,
    transactionId: payload.transactionId ?? null,
    notes: payload.notes ?? null,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');
  const payload = updatePaymentSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('payments').update({
      ...(payload.paymentMethod !== undefined ? { payment_method: payload.paymentMethod } : {}),
      ...(payload.transactionId !== undefined ? { transaction_id: payload.transactionId ?? null } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
    }).eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Payment not found');
    return NextResponse.json(normalizeSupabasePaymentRow(data));
  }
  const [updated] = await db.update(payments).set({
    ...(payload.paymentMethod !== undefined ? { paymentMethod: payload.paymentMethod } : {}),
    ...(payload.transactionId !== undefined ? { transactionId: payload.transactionId ?? null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
  }).where(eq(payments.id, id)).returning();
  if (!updated) throw new NotFoundError('Payment not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('payments').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Payment not found');
    return NextResponse.json({ message: 'Payment deleted successfully', payment: normalizeSupabasePaymentRow(data) });
  }
  const [deleted] = await db.delete(payments).where(eq(payments.id, id)).returning();
  if (!deleted) throw new NotFoundError('Payment not found');
  return NextResponse.json({ message: 'Payment deleted successfully', payment: deleted });
}, { requireAuth: true, roles: ['Manager'] });
