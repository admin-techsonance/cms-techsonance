import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createClientCommunicationSchema, updateClientCommunicationSchema } from '@/server/validation/crm';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseClientCommunicationRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    userId,
    message: row.message,
    attachments: row.attachments ?? null,
    createdAt: row.created_at ?? null,
    isRead: Boolean(row.is_read ?? false),
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    const communicationId = Number(id);
    if (!Number.isInteger(communicationId) || communicationId <= 0) throw new BadRequestError('Valid communication id is required');
    const { data: communication, error } = await supabase
      .from('client_communications')
      .select('*')
      .eq('id', communicationId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !communication) throw new NotFoundError('Client communication not found');
    if (!isAdminLike && communication.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to view this communication');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(communication.user_id)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseClientCommunicationRow(communication, userMap), 'Client communication fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const clientIdParam = searchParams.get('clientId');
  const userIdParam = searchParams.get('userId');
  const isRead = searchParams.get('isRead');
  let query = supabase
    .from('client_communications')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (clientIdParam) {
    const clientId = Number(clientIdParam);
    if (!Number.isInteger(clientId) || clientId <= 0) throw new BadRequestError('Valid client id is required');
    query = query.eq('client_id', clientId);
  }

  if (isAdminLike && userIdParam) {
    const requestedUserId = Number(userIdParam);
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) throw new BadRequestError('Valid user id is required');
    query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, requestedUserId, tenantId));
  } else if (!isAdminLike) {
    query = query.eq('user_id', actor.authUserId);
  }

  if (isRead !== null) query = query.eq('is_read', isRead === 'true' || isRead === '1');

  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean), tenantId);
  return apiSuccess(rows.map((row) => normalizeSupabaseClientCommunicationRow(row, userMap)), 'Client communications fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createClientCommunicationSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const targetAuthUserId = isAdminLike && payload.userId
    ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId)
    : actor.authUserId;
  if (!isAdminLike && targetAuthUserId !== actor.authUserId) {
    throw new ForbiddenError('You can only create communications for your own user');
  }
  const [{ data: client }, { data: communicationUser }] = await Promise.all([
    supabase
      .from('clients')
      .select('id')
      .eq('id', payload.clientId)
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('users')
      .select('id')
      .eq('id', targetAuthUserId)
      .eq('tenant_id', tenantId)
      .single(),
  ]);
  if (!client) throw new NotFoundError('Client not found');
  if (!communicationUser) throw new NotFoundError('User not found');
  const { data, error } = await supabase.from('client_communications').insert({
    client_id: payload.clientId,
    user_id: targetAuthUserId,
    message: payload.message,
    attachments: payload.attachments ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    is_read: false,
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create client communication');
  const userMap = await buildLegacyUserIdMap(accessToken, [targetAuthUserId], tenantId);
  return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const communicationId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(communicationId) || communicationId <= 0) {
    throw new BadRequestError('Valid communication id is required');
  }

  const payload = updateClientCommunicationSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a client communication');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('client_communications')
    .select('*')
    .eq('id', communicationId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Client communication not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to update this communication');
  const { data, error } = await supabase
    .from('client_communications')
    .update({
      ...(payload.message !== undefined ? { message: payload.message } : {}),
      ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
      ...(payload.isRead !== undefined ? { is_read: payload.isRead } : {}),
    })
    .eq('id', communicationId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to update client communication');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const communicationId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(communicationId) || communicationId <= 0) {
    throw new BadRequestError('Valid communication id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('client_communications')
    .select('*')
    .eq('id', communicationId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Client communication not found');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to delete this communication');
  const { data, error } = await supabase
    .from('client_communications')
    .delete()
    .eq('id', communicationId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to delete client communication');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseClientCommunicationRow(data, userMap), 'Client communication deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
