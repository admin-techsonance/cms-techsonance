import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients, tickets, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createTicketSchema, ticketPrioritySchema, ticketStatusSchema, updateTicketSchema } from '@/server/validation/helpdesk';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const ticketNumber = searchParams.get('ticketNumber');
  if (id || ticketNumber) {
    const conditions = [id ? eq(tickets.id, Number(id)) : eq(tickets.ticketNumber, String(ticketNumber))];
    const [ticket] = await db.select().from(tickets).where(and(...conditions)).limit(1);
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (!isAdminLike && ticket.createdBy !== user.id) throw new ForbiddenError('Unauthorized');
    return NextResponse.json(ticket);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const assignedTo = searchParams.get('assignedTo');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const conditions = [];
  if (!isAdminLike) conditions.push(eq(tickets.createdBy, user.id));
  if (search) conditions.push(or(like(tickets.ticketNumber, `%${search}%`), like(tickets.subject, `%${search}%`), like(tickets.description, `%${search}%`)));
  if (clientId) conditions.push(eq(tickets.clientId, Number(clientId)));
  if (status) conditions.push(eq(tickets.status, ticketStatusSchema.parse(status)));
  if (priority) conditions.push(eq(tickets.priority, ticketPrioritySchema.parse(priority)));
  if (assignedTo) conditions.push(eq(tickets.assignedTo, Number(assignedTo)));
  if (startDate) conditions.push(gte(tickets.createdAt, startDate));
  if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); conditions.push(lte(tickets.createdAt, end.toISOString())); }
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(tickets);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(tickets);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const [rows, countRows] = await Promise.all([query.orderBy(desc(tickets.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Tickets fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTicketSchema.parse(await request.json());
  const [existingTicket] = await db.select().from(tickets).where(eq(tickets.ticketNumber, payload.ticketNumber)).limit(1);
  if (existingTicket) throw new ConflictError('Ticket number already exists');
  const [client] = await db.select().from(clients).where(eq(clients.id, payload.clientId)).limit(1);
  if (!client) throw new NotFoundError('Client not found');
  if (payload.assignedTo) {
    const [assignedUser] = await db.select().from(users).where(eq(users.id, payload.assignedTo)).limit(1);
    if (!assignedUser) throw new NotFoundError('Assigned user not found');
  }
  const now = new Date().toISOString();
  const [created] = await db.insert(tickets).values({
    ticketNumber: payload.ticketNumber,
    clientId: payload.clientId,
    subject: payload.subject,
    description: payload.description,
    priority: payload.priority ?? 'medium',
    status: payload.status ?? 'open',
    assignedTo: payload.assignedTo ?? null,
    createdBy: context.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket id is required');
  const payload = updateTicketSchema.parse(await request.json());
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ticket not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.createdBy !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  if (payload.assignedTo) {
    const [assignedUser] = await db.select().from(users).where(eq(users.id, payload.assignedTo)).limit(1);
    if (!assignedUser) throw new NotFoundError('Assigned user not found');
  }
  const [updated] = await db.update(tickets).set({
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.assignedTo !== undefined ? { assignedTo: payload.assignedTo ?? null } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(tickets.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket id is required');
  const [existing] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ticket not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.createdBy !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  const [deleted] = await db.delete(tickets).where(eq(tickets.id, id)).returning();
  return NextResponse.json({ message: 'Ticket deleted successfully', ticket: deleted });
}, { requireAuth: true, roles: ['Employee'] });

