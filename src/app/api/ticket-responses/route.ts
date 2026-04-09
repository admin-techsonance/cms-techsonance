import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { ticketResponses, tickets } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createTicketResponseSchema, updateTicketResponseSchema } from '@/server/validation/helpdesk';

async function assertTicketAccess(ticketId: number, userId: number, isAdminLike: boolean) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!isAdminLike && ticket.createdBy !== userId) throw new ForbiddenError('Unauthorized');
  return ticket;
}

export const GET = withApiHandler(async (request, context) => {
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    const [response] = await db.select().from(ticketResponses).where(eq(ticketResponses.id, Number(id))).limit(1);
    if (!response) throw new NotFoundError('Ticket response not found');
    await assertTicketAccess(response.ticketId, context.auth!.user.id, isAdminLike);
    return NextResponse.json(response);
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const ticketId = searchParams.get('ticketId');
  const userId = searchParams.get('userId');
  if (ticketId) await assertTicketAccess(Number(ticketId), context.auth!.user.id, isAdminLike);
  const conditions = [];
  if (ticketId) conditions.push(eq(ticketResponses.ticketId, Number(ticketId)));
  if (userId) conditions.push(eq(ticketResponses.userId, Number(userId)));
  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(ticketResponses);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(ticketResponses);
  if (whereClause) { query = query.where(whereClause) as typeof query; countQuery = countQuery.where(whereClause) as typeof countQuery; }
  const [rows, countRows] = await Promise.all([query.orderBy(asc(ticketResponses.createdAt)).limit(limit).offset(offset), countQuery]);
  return NextResponse.json({ success: true, data: rows, message: 'Ticket responses fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTicketResponseSchema.parse(await request.json());
  await assertTicketAccess(payload.ticketId, context.auth!.user.id, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin');
  const [created] = await db.insert(ticketResponses).values({
    ticketId: payload.ticketId,
    userId: context.auth!.user.id,
    message: payload.message,
    attachments: payload.attachments ?? null,
    createdAt: new Date().toISOString(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket response id is required');
  const payload = updateTicketResponseSchema.parse(await request.json());
  const [existing] = await db.select().from(ticketResponses).where(eq(ticketResponses.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ticket response not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.userId !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  const [updated] = await db.update(ticketResponses).set({
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments ?? null } : {}),
  }).where(eq(ticketResponses.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket response id is required');
  const [existing] = await db.select().from(ticketResponses).where(eq(ticketResponses.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ticket response not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.userId !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  const [deleted] = await db.delete(ticketResponses).where(eq(ticketResponses.id, id)).returning();
  return NextResponse.json({ message: 'Ticket response deleted successfully', data: deleted });
}, { requireAuth: true, roles: ['Employee'] });

