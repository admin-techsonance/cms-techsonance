import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createTicketSchema, ticketPrioritySchema, ticketStatusSchema, updateTicketSchema } from '@/server/validation/helpdesk';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseTicketRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const assignedTo = typeof row.assigned_to === 'string' ? userMap.get(row.assigned_to) ?? null : null;
  const createdBy = typeof row.created_by === 'string' ? userMap.get(row.created_by) ?? null : null;
  return {
    id: Number(row.id),
    ticketNumber: row.ticket_number,
    clientId: Number(row.client_id),
    subject: row.subject,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedTo,
    createdBy,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const ticketNumber = searchParams.get('ticketNumber');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);

  if (id || ticketNumber) {
    let query = supabase
      .from('tickets')
      .select('*')
      .eq('tenant_id', tenantId);
    query = id ? query.eq('id', Number(id)) : query.eq('ticket_number', String(ticketNumber));
    const { data: ticket, error } = await query.single();
    if (error || !ticket) throw new NotFoundError('Ticket not found');
    if (!isAdminLike && ticket.created_by !== actor.authUserId) throw new ForbiddenError('Unauthorized');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(ticket.assigned_to), String(ticket.created_by)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseTicketRow(ticket, userMap));
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
  
  let query = supabase
    .from('tickets')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
    
  if (!isAdminLike) query = query.eq('created_by', actor.authUserId);
  if (search) query = query.or(`ticket_number.ilike.%${search}%,subject.ilike.%${search}%,description.ilike.%${search}%`);
  if (clientId) query = query.eq('client_id', Number(clientId));
  if (status) query = query.eq('status', ticketStatusSchema.parse(status));
  if (priority) query = query.eq('priority', ticketPrioritySchema.parse(priority));
  if (assignedTo) query = query.eq('assigned_to', await resolveAuthUserIdFromLegacyUserId(accessToken, Number(assignedTo)));
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); query = query.lte('created_at', end.toISOString()); }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.flatMap((row) => [String(row.assigned_to), String(row.created_by)]).filter(Boolean));
  return NextResponse.json({ success: true, data: rows.map((row) => normalizeSupabaseTicketRow(row, userMap)), message: 'Tickets fetched successfully', errors: null, meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTicketSchema.parse(await request.json());
  
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existingTicket } = await supabase
    .from('tickets')
    .select('id')
    .eq('ticket_number', payload.ticketNumber)
    .eq('tenant_id', tenantId)
    .maybeSingle();
    
  if (existingTicket) throw new ConflictError('Ticket number already exists');
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', payload.clientId)
    .eq('tenant_id', tenantId)
    .single();
  if (!client) throw new NotFoundError('Client not found');
  const assignedToAuthUserId = payload.assignedTo ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.assignedTo) : null;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('tickets').insert({
    ticket_number: payload.ticketNumber,
    client_id: payload.clientId,
    subject: payload.subject,
    description: payload.description,
    priority: payload.priority ?? 'medium',
    status: payload.status ?? 'open',
    assigned_to: assignedToAuthUserId,
    created_by: actor.authUserId,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create ticket');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(assignedToAuthUserId), actor.authUserId].filter(Boolean));
  return NextResponse.json(normalizeSupabaseTicketRow(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket id is required');
  const payload = updateTicketSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existing } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Ticket not found');
  if (!isAdminLike && existing.created_by !== actor.authUserId) throw new ForbiddenError('Unauthorized');
  const assignedToAuthUserId = payload.assignedTo ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.assignedTo) : payload.assignedTo === null ? null : undefined;
  const { data, error } = await supabase.from('tickets').update({
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(assignedToAuthUserId !== undefined ? { assigned_to: assignedToAuthUserId } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to update ticket');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.assigned_to), String(data.created_by)].filter(Boolean));
  return NextResponse.json(normalizeSupabaseTicketRow(data, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid ticket id is required');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existing } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Ticket not found');
  if (!isAdminLike && existing.created_by !== actor.authUserId) throw new ForbiddenError('Unauthorized');
  const { data, error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to delete ticket');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.assigned_to), String(data.created_by)].filter(Boolean));
  return NextResponse.json({ message: 'Ticket deleted successfully', ticket: normalizeSupabaseTicketRow(data, userMap) });
}, { requireAuth: true, roles: ['Employee'] });
