import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients, invoices, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createInvoiceSchema, invoiceStatusSchema, updateInvoiceSchema } from '@/server/validation/billing';

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

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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

export const POST = withApiHandler(async (request) => {
  const payload = createInvoiceSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');
  const payload = updateInvoiceSchema.parse(await request.json());
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

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid invoice id is required');
  const [deleted] = await db.delete(invoices).where(eq(invoices.id, id)).returning();
  if (!deleted) throw new NotFoundError('Invoice not found');
  return NextResponse.json({ message: 'Invoice deleted successfully', invoice: deleted });
}, { requireAuth: true, roles: ['Manager'] });

