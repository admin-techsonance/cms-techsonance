import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { createChatMessageSchema, updateChatMessageSchema } from '@/server/validation/internal-comms';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseChatMessageRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const senderId = typeof row.sender_id === 'string' ? userMap.get(row.sender_id) ?? null : null;
  const receiverId = typeof row.receiver_id === 'string' ? userMap.get(row.receiver_id) ?? null : null;

  return {
    id: Number(row.id),
    senderId,
    receiverId,
    roomId: row.room_id ?? null,
    message: row.message,
    attachments: row.attachments ?? null,
    createdAt: row.created_at ?? null,
    isRead: Boolean(row.is_read),
  };
}

export const GET = withApiHandler(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    const messageId = Number(id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      throw new BadRequestError('Valid chat message id is required');
    }
    const { data: message, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .or(`sender_id.eq.${actor.authUserId},receiver_id.eq.${actor.authUserId}`)
      .single();
    if (error || !message) throw new NotFoundError('Chat message not found');
    const userMap = await buildLegacyUserIdMap(
      accessToken,
      [String(message.sender_id), String(message.receiver_id)].filter((value) => value && value !== 'null')
    );
    return NextResponse.json(normalizeSupabaseChatMessageRow(message, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const senderId = searchParams.get('senderId');
  const receiverId = searchParams.get('receiverId');
  const roomId = searchParams.get('roomId');
  const isRead = searchParams.get('isRead');
  let query = supabase
    .from('chat_messages')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .or(`sender_id.eq.${actor.authUserId},receiver_id.eq.${actor.authUserId}`);

  if (senderId) {
    const numericSenderId = Number(senderId);
    if (!Number.isInteger(numericSenderId) || numericSenderId <= 0) {
      throw new BadRequestError('Valid sender id is required');
    }
    query = query.eq('sender_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericSenderId));
  }
  if (receiverId) {
    const numericReceiverId = Number(receiverId);
    if (!Number.isInteger(numericReceiverId) || numericReceiverId <= 0) {
      throw new BadRequestError('Valid receiver id is required');
    }
    query = query.eq('receiver_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericReceiverId));
  }
  if (roomId) query = query.eq('room_id', roomId);
  if (isRead === 'true' || isRead === 'false') query = query.eq('is_read', isRead === 'true');

  const { data, count, error } = await query
    .order('created_at', { ascending: searchParams.get('order') !== 'desc' })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(
    accessToken,
    rows.flatMap((row) => [String(row.sender_id), String(row.receiver_id)]).filter((value) => value && value !== 'null')
  );

  return NextResponse.json({
    success: true,
    data: rows.map((row) => normalizeSupabaseChatMessageRow(row, userMap)),
    message: 'Chat messages fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createChatMessageSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  let receiverAuthUserId: string | null = null;

  if (payload.receiverId) {
    receiverAuthUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.receiverId);
  }

  const { data: created, error } = await supabase.from('chat_messages').insert({
    sender_id: actor.authUserId,
    receiver_id: receiverAuthUserId,
    room_id: payload.roomId?.trim() || null,
    message: payload.message.trim(),
    attachments: payload.attachments ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    is_read: false,
  }).select('*').single();

  if (error || !created) throw error ?? new Error('Failed to create chat message');
  const userMap = await buildLegacyUserIdMap(
    accessToken,
    [actor.authUserId, receiverAuthUserId].filter((value): value is string => Boolean(value))
  );
  return NextResponse.json(normalizeSupabaseChatMessageRow(created, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid chat message id is required');
  const payload = updateChatMessageSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Chat message not found');
  if (payload.message !== undefined && existing.sender_id !== actor.authUserId) {
    throw new ForbiddenError('Only the sender can edit the message content');
  }
  if (
    payload.isRead !== undefined &&
    existing.receiver_id !== actor.authUserId &&
    existing.sender_id !== actor.authUserId
  ) {
    throw new ForbiddenError('Unauthorized');
  }

  const { data: updated, error } = await supabase.from('chat_messages').update({
    ...(payload.message !== undefined ? { message: payload.message.trim() } : {}),
    ...(payload.isRead !== undefined ? { is_read: payload.isRead } : {}),
    ...(payload.attachments !== undefined ? { attachments: payload.attachments ?? null } : {}),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !updated) throw error ?? new Error('Failed to update chat message');
  const userMap = await buildLegacyUserIdMap(
    accessToken,
    [String(updated.sender_id), String(updated.receiver_id)].filter((value) => value && value !== 'null')
  );
  return NextResponse.json(normalizeSupabaseChatMessageRow(updated, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid chat message id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Chat message not found');
  if (existing.sender_id !== actor.authUserId) throw new ForbiddenError('Only the sender can delete a chat message');

  const { data: deleted, error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete chat message');
  const userMap = await buildLegacyUserIdMap(
    accessToken,
    [String(deleted.sender_id), String(deleted.receiver_id)].filter((value) => value && value !== 'null')
  );
  return NextResponse.json({
    message: 'Chat message deleted successfully',
    data: normalizeSupabaseChatMessageRow(deleted, userMap),
  });
}, { requireAuth: true, roles: ['Employee'] });
