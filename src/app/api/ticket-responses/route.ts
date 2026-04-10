import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { ticketResponses, tickets } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createTicketResponseSchema, updateTicketResponseSchema } from '@/server/validation/helpdesk';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

async function assertTicketAccess(ticketId: number, userId: number, isAdminLike: boolean) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!isAdminLike && ticket.createdBy !== userId) throw new ForbiddenError('Unauthorized');
  return ticket;
}

async function assertSupabaseTicketAccess(ticketId: number, authUserId: string, isAdminLike: boolean, accessToken: string) {
  const supabase = getRouteSupabase(accessToken);
  const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!isAdminLike && ticket.created_by !== authUserId) throw new ForbiddenError('Unauthorized');
  return ticket;
}

function normalizeSupabaseTicketResponseRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    ticketId: Number(row.ticket_id),
    userId,
    message: row.message,
    attachments: row.attachments ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    if (id) {
      const { data: response, error } = await supabase.from('ticket_responses').select('*').eq('id', Number(id)).single();
      if (error || !response) throw new NotFoundError('Ticket response not found');
      await assertSupabaseTicketAccess(Number(response.ticket_id), actor.authUserId, isAdminLike, accessToken);
      const userMap = await buildLegacyUserIdMap(accessToken, [String(response.user_id)]);
      return NextResponse.json(normalizeSupabaseTicketResponseRow(response, userMap));
    }
    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const ticketId = searchParams.get('ticketId');
    const userId = searchParams.get('userId');
    if (ticketId) await assertSupabaseTicketAccess(Number(ticketId), actor.authUserId, isAdminLike, accessToken);
    let query = supabase.from('ticket_responses').select('*', { count: 'exact' });
    if (ticketId) query = query.eq('ticket_id', Number(ticketId));
    if (userId) query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, Number(userId)));
    const { data, count, error } = await query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return NextResponse.json({ success: true, data: rows.map((row) => normalizeSupabaseTicketResponseRow(row, userMap)), message: 'Ticket responses fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
  }
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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    await assertSupabaseTicketAccess(payload.ticketId, actor.authUserId, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin', accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('ticket_responses').insert({
      ticket_id: payload.ticketId,
      user_id: actor.authUserId,
      message: payload.message,
      attachments: payload.attachments ?? null,
      created_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create ticket response');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return NextResponse.json(normalizeSupabaseTicketResponseRow(data, userMap), { status: 201 });
  }
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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('ticket_responses').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Ticket response not found');
    const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Unauthorized');
    const { data, error } = await supabase.from('ticket_responses').update({
      ...(payload.message !== undefined ? { message: payload.message } : {}),
      ...(payload.attachments !== undefined ? { attachments: payload.attachments ?? null } : {}),
    }).eq('id', id).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update ticket response');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)]);
    return NextResponse.json(normalizeSupabaseTicketResponseRow(data, userMap));
  }
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
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('ticket_responses').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Ticket response not found');
    const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
    if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Unauthorized');
    const { data, error } = await supabase.from('ticket_responses').delete().eq('id', id).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to delete ticket response');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)]);
    return NextResponse.json({ message: 'Ticket response deleted successfully', data: normalizeSupabaseTicketResponseRow(data, userMap) });
  }
  const [existing] = await db.select().from(ticketResponses).where(eq(ticketResponses.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Ticket response not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.userId !== context.auth!.user.id) throw new ForbiddenError('Unauthorized');
  const [deleted] = await db.delete(ticketResponses).where(eq(ticketResponses.id, id)).returning();
  return NextResponse.json({ message: 'Ticket response deleted successfully', data: deleted });
}, { requireAuth: true, roles: ['Employee'] });
