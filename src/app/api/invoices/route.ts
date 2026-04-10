import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createInvoiceSchema, invoiceStatusSchema, updateInvoiceSchema } from '@/server/validation/billing';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

async function assertInvoiceRelations(input: { clientId?: number; projectId?: number | null }) {
  if (input.clientId !== undefined) {
    const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
    if (!client) throw new NotFoundError('Client not found');
  }
  if (input.projectId) {
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');
  }
}

async function assertSupabaseInvoiceRelations(accessToken: string, input: { clientId?: number; projectId?: number | null }) {
  const supabase = getRouteSupabase(accessToken);
  if (input.clientId !== undefined) {
    const { data } = await supabase.from('clients').select('id').eq('id', input.clientId).single();
    if (!data) throw new NotFoundError('Client not found');
  }
  if (input.projectId) {
    const { data } = await supabase.from('projects').select('id').eq('id', input.projectId).single();
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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const { data, error } = await supabase.from('invoices').select('*').eq('id', Number(id)).single();
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
    let query = supabase.from('invoices').select('*', { count: 'exact' });
    if (search) query = query.ilike('invoice_number', `%${search}%`);
    if (clientId) query = query.eq('client_id', Number(clientId));
    if (projectId) query = query.eq('project_id', Number(projectId));
    if (status) query = query.eq('status', invoiceStatusSchema.parse(status));
    if (startDate) query = query.gte('due_date', startDate);
    if (endDate) query = query.lte('due_date', endDate);
    const { data, count, error } = await query
      .order(sort === 'dueDate' ? 'due_date' : sort === 'totalAmount' ? 'total_amount' : 'created_at', { ascending })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return NextResponse.json({ success: true, data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseInvoiceRow), message: 'Invoices fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
  }
  if (id) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, Number(id))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice not found');
    return NextResponse.json(invoice);
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
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = [];
  if (search) conditions.push(like(invoices.invoiceNumber, `%${search}%`));
  if (clientId) conditions.push(eq(invoices.clientId, Number(clientId)));
  if (projectId) conditions.push(eq(invoices.projectId, Number(projectId)));
  if (status) conditions.push(eq(invoices.status, invoiceStatusSchema.parse(status)));
  if (startDate) conditions.push(gte(invoices.dueDate, startDate));
  if (endDate) conditions.push(lte(invoices.dueDate, endDate));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(invoices);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(invoices);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }
  const sortColumn = sort === 'dueDate' ? invoices.dueDate : sort === 'totalAmount' ? invoices.totalAmount : invoices.createdAt;
  const [rows, countRows] = await Promise.all([query.orderBy(order(sortColumn)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Invoices fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createInvoiceSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    await assertSupabaseInvoiceRelations(accessToken, { clientId: payload.clientId, projectId: payload.projectId });
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('invoices').select('id').eq('invoice_number', payload.invoiceNumber).maybeSingle();
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
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create invoice');
    return NextResponse.json(normalizeSupabaseInvoiceRow(data), { status: 201 });
  }
  await assertInvoiceRelations({ clientId: payload.clientId, projectId: payload.projectId });
  const [existing] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, payload.invoiceNumber)).limit(1);
  if (existing) throw new ConflictError('Invoice number already exists');
  const now = new Date().toISOString();
  const [created] = await db.insert(invoices).values({
    invoiceNumber: payload.invoiceNumber,
    clientId: payload.clientId,
    projectId: payload.projectId ?? null,
    amount: payload.amount,
    tax: payload.tax,
    totalAmount: payload.totalAmount,
    dueDate: payload.dueDate,
    status: payload.status ?? 'draft',
    paidDate: payload.paidDate ?? null,
    notes: payload.notes ?? null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');
  const payload = updateInvoiceSchema.parse(await request.json());
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existingInvoice } = await supabase.from('invoices').select('*').eq('id', id).single();
    if (!existingInvoice) throw new NotFoundError('Invoice not found');
    await assertSupabaseInvoiceRelations(accessToken, { clientId: payload.clientId, projectId: payload.projectId });
    if (payload.invoiceNumber && payload.invoiceNumber !== existingInvoice.invoice_number) {
      const { data: duplicate } = await supabase.from('invoices').select('id').eq('invoice_number', payload.invoiceNumber).maybeSingle();
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
    }).eq('id', id).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update invoice');
    return NextResponse.json(normalizeSupabaseInvoiceRow(data));
  }
  const [existingInvoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existingInvoice) throw new NotFoundError('Invoice not found');
  await assertInvoiceRelations({ clientId: payload.clientId, projectId: payload.projectId });
  if (payload.invoiceNumber && payload.invoiceNumber !== existingInvoice.invoiceNumber) {
    const [duplicate] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, payload.invoiceNumber)).limit(1);
    if (duplicate) throw new ConflictError('Invoice number already exists');
  }
  const [updated] = await db.update(invoices).set({
    ...(payload.invoiceNumber !== undefined ? { invoiceNumber: payload.invoiceNumber } : {}),
    ...(payload.clientId !== undefined ? { clientId: payload.clientId } : {}),
    ...(payload.projectId !== undefined ? { projectId: payload.projectId ?? null } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.tax !== undefined ? { tax: payload.tax } : {}),
    ...(payload.totalAmount !== undefined ? { totalAmount: payload.totalAmount } : {}),
    ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate } : {}),
    ...(payload.paidDate !== undefined ? { paidDate: payload.paidDate ?? null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(invoices.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('invoices').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Invoice not found');
    return NextResponse.json({ message: 'Invoice deleted successfully', invoice: normalizeSupabaseInvoiceRow(data) });
  }
  const [deleted] = await db.delete(invoices).where(eq(invoices.id, id)).returning();
  if (!deleted) throw new NotFoundError('Invoice not found');
  return NextResponse.json({ message: 'Invoice deleted successfully', invoice: deleted });
}, { requireAuth: true, roles: ['Manager'] });
