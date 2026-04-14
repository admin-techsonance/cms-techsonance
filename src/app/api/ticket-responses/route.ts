import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createTicketResponseSchema, updateTicketResponseSchema } from '@/server/validation/helpdesk';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

async function assertSupabaseTicketAccess(ticketId: number, authUserId: string, isAdminLike: boolean, tenantId: string) {
  const supabase = getAdminRouteSupabase();
  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .eq('tenant_id', tenantId)
    .single();
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

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data: response, error } = await supabase
      .from('ticket_responses')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !response) throw new NotFoundError('Ticket response not found');
    await assertSupabaseTicketAccess(Number(response.ticket_id), actor.authUserId, isAdminLike, tenantId);
    const userMap = await buildLegacyUserIdMap(accessToken, [String(response.user_id)]);
    return NextResponse.json(normalizeSupabaseTicketResponseRow(response, userMap));
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const ticketId = searchParams.get('ticketId');
  const userId = searchParams.get('userId');
  if (ticketId) await assertSupabaseTicketAccess(Number(ticketId), actor.authUserId, isAdminLike, tenantId);
  let query = supabase
    .from('ticket_responses')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (ticketId) query = query.eq('ticket_id', Number(ticketId));
  if (userId) query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, Number(userId)));
  const { data, count, error } = await query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
  return NextResponse.json({ success: true, data: rows.map((row) => normalizeSupabaseTicketResponseRow(row, userMap)), message: 'Ticket responses fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTicketResponseSchema.parse(await request.json());
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  await assertSupabaseTicketAccess(payload.ticketId, actor.authUserId, context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin', tenantId);
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('ticket_responses').insert({
    ticket_id: payload.ticketId,
    user_id: actor.authUserId,
    message: payload.message,
    attachments: payload.attachments ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create ticket response');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
  return NextResponse.json(normalizeSupabaseTicketResponseRow(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket response id is required');
  const payload = updateTicketResponseSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('ticket_responses')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Ticket response not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Unauthorized');
  const { data, error } = await supabase.from('ticket_responses').update({
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments ?? null } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to update ticket response');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)]);
  return NextResponse.json(normalizeSupabaseTicketResponseRow(data, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket response id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('ticket_responses')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existing) throw new NotFoundError('Ticket response not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('Unauthorized');
  const { data, error } = await supabase
    .from('ticket_responses')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to delete ticket response');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)]);
  return NextResponse.json({ message: 'Ticket response deleted successfully', data: normalizeSupabaseTicketResponseRow(data, userMap) });
}, { requireAuth: true, roles: ['Employee'] });
