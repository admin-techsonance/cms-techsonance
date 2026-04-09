import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { invoices, payments } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createPaymentSchema, updatePaymentSchema } from '@/server/validation/billing';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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

export const POST = withApiHandler(async (request) => {
  const payload = createPaymentSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');
  const payload = updatePaymentSchema.parse(await request.json());
  const [updated] = await db.update(payments).set({
    ...(payload.paymentMethod !== undefined ? { paymentMethod: payload.paymentMethod } : {}),
    ...(payload.transactionId !== undefined ? { transactionId: payload.transactionId ?? null } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes ?? null } : {}),
  }).where(eq(payments.id, id)).returning();
  if (!updated) throw new NotFoundError('Payment not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid payment id is required');
  const [deleted] = await db.delete(payments).where(eq(payments.id, id)).returning();
  if (!deleted) throw new NotFoundError('Payment not found');
  return NextResponse.json({ message: 'Payment deleted successfully', payment: deleted });
}, { requireAuth: true, roles: ['Manager'] });

