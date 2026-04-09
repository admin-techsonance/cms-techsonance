import { NextResponse } from 'next/server';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/db';
import { invoiceItems, invoices } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createInvoiceItemSchema, updateInvoiceItemSchema } from '@/server/validation/invoice-items';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const invoiceId = searchParams.get('invoiceId');
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') ?? 'id';
  const order = searchParams.get('order') === 'asc' ? asc : desc;

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
  const [rows, countRows] = await Promise.all([query.orderBy(order(sortColumn)).limit(limit).offset(offset), countQuery]);
  const aggregation = invoiceId ? await db.select({ total: sql<number>`coalesce(sum(${invoiceItems.amount}),0)` }).from(invoiceItems).where(eq(invoiceItems.invoiceId, Number(invoiceId))) : null;
  return NextResponse.json({ success: true, data: rows, message: 'Invoice items fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) }, ...(aggregation ? { totalAmount: aggregation[0]?.total ?? 0 } : {}) });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createInvoiceItemSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');
  const payload = updateInvoiceItemSchema.parse(await request.json());
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

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice item id is required');
  const [deleted] = await db.delete(invoiceItems).where(eq(invoiceItems.id, id)).returning();
  if (!deleted) throw new NotFoundError('Invoice item not found');
  return NextResponse.json({ message: 'Invoice item deleted successfully', item: deleted });
}, { requireAuth: true, roles: ['Manager'] });

