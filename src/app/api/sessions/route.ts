import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createSessionSchema, updateSessionSchema } from '@/server/validation/system';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseSessionRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    userId,
    token: row.token,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const userIdParam = searchParams.get('userId');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !session) throw new NotFoundError('Session not found');
    if (!isAdminLike && session.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to view this session');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(session.user_id)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseSessionRow(session, userMap), 'Session fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  let query = supabase.from('sessions').select('*', { count: 'exact' }).eq('tenant_id', tenantId);
  if (userIdParam) {
    const requestedUserId = Number(userIdParam);
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) throw new BadRequestError('Valid user id is required');
    if (!isAdminLike && requestedUserId !== user.id) throw new ForbiddenError('You can only list your own sessions');
    query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, requestedUserId, tenantId));
  } else if (!isAdminLike) {
    query = query.eq('user_id', actor.authUserId);
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean), tenantId);
  return apiSuccess(rows.map((row) => normalizeSupabaseSessionRow(row, userMap)), 'Sessions fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createSessionSchema.parse(await request.json());
  if (new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId);
  const [userExists, tokenExists] = await Promise.all([
    supabase.from('users').select('id').eq('id', authUserId).eq('tenant_id', tenantId).single(),
    supabase.from('sessions').select('id').eq('token', payload.token).eq('tenant_id', tenantId).single(),
  ]);
  if (!userExists.data) throw new NotFoundError('User not found');
  if (tokenExists.data) throw new ConflictError('Session token already exists');
  const { data: created, error } = await supabase.from('sessions').insert({
    user_id: authUserId,
    token: payload.token,
    expires_at: new Date(payload.expiresAt).toISOString(),
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create session');
  const userMap = await buildLegacyUserIdMap(accessToken, [authUserId], tenantId);
  return apiSuccess(normalizeSupabaseSessionRow(created, userMap), 'Session created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });

export const PUT = withApiHandler(async (request, context) => {
  const sessionId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
  const payload = updateSessionSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) throw new BadRequestError('At least one field is required to update a session');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Session not found');
  if (payload.expiresAt && new Date(payload.expiresAt) <= new Date()) throw new BadRequestError('expiresAt must be a future datetime');
  let authUserId: string | undefined;
  if (payload.userId !== undefined) {
    authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId);
    const { data: userExists } = await supabase
      .from('users')
      .select('id')
      .eq('id', authUserId)
      .eq('tenant_id', tenantId)
      .single();
    if (!userExists) throw new NotFoundError('User not found');
  }
  if (payload.token !== undefined) {
    const { data: tokenExists } = await supabase
      .from('sessions')
      .select('id')
      .eq('token', payload.token)
      .eq('tenant_id', tenantId)
      .single();
    if (tokenExists && Number(tokenExists.id) !== sessionId) throw new ConflictError('Session token already exists');
  }
  const { data: updated, error } = await supabase.from('sessions').update({
    ...(authUserId !== undefined ? { user_id: authUserId } : {}),
    ...(payload.token !== undefined ? { token: payload.token } : {}),
    ...(payload.expiresAt !== undefined ? { expires_at: new Date(payload.expiresAt).toISOString() } : {}),
  })
  .eq('id', sessionId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update session');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseSessionRow(updated, userMap), 'Session updated successfully');
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const sessionId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new BadRequestError('Valid session id is required');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Session not found');
  if (!isAdminLike && existing.user_id !== actor.authUserId) throw new ForbiddenError('You do not have permission to delete this session');
  const { data: deleted, error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete session');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseSessionRow(deleted, userMap), 'Session deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
