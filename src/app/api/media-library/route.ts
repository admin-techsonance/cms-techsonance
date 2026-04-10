import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/db';
import { mediaLibrary } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createMediaFileSchema, updateMediaFileSchema } from '@/server/validation/assets';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseMediaRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const uploadedBy = typeof row.uploaded_by === 'string' ? userMap.get(row.uploaded_by) ?? null : null;

  return {
    id: Number(row.id),
    name: row.name,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedBy,
    createdAt: row.created_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const mediaId = Number(id);
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        throw new BadRequestError('Valid media item id is required');
      }

      const { data: record, error } = await supabase.from('media_library').select('*').eq('id', mediaId).single();
      if (error || !record) throw new NotFoundError('Media file not found');
      if (!isAdminLike && record.uploaded_by !== actor.authUserId) {
        throw new ForbiddenError('You do not have permission to view this media file');
      }

      const userMap = await buildLegacyUserIdMap(accessToken, [String(record.uploaded_by)].filter(Boolean));
      return apiSuccess(normalizeSupabaseMediaRow(record, userMap), 'Media file fetched successfully');
    }

    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const search = searchParams.get('search');
    const fileType = searchParams.get('fileType');
    const uploadedByParam = searchParams.get('uploadedBy');
    let query = supabase.from('media_library').select('*', { count: 'exact' });

    if (search) query = query.ilike('name', `%${search}%`);
    if (fileType) query = query.eq('file_type', fileType);

    if (uploadedByParam) {
      const uploadedBy = Number(uploadedByParam);
      if (!Number.isInteger(uploadedBy) || uploadedBy <= 0) {
        throw new BadRequestError('Valid uploadedBy user id is required');
      }
      if (!isAdminLike && uploadedBy !== user.id) {
        throw new ForbiddenError('You can only filter by your own uploads');
      }
      query = query.eq('uploaded_by', await resolveAuthUserIdFromLegacyUserId(accessToken, uploadedBy));
    } else if (!isAdminLike) {
      query = query.eq('uploaded_by', actor.authUserId);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.uploaded_by)).filter(Boolean));

    return apiSuccess(
      rows.map((row) => normalizeSupabaseMediaRow(row, userMap)),
      'Media files fetched successfully',
      { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
    );
  }

  if (id) {
    const mediaId = Number(id);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      throw new BadRequestError('Valid media item id is required');
    }

    const [record] = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, mediaId)).limit(1);
    if (!record) throw new NotFoundError('Media file not found');
    if (!isAdminLike && record.uploadedBy !== user.id) {
      throw new ForbiddenError('You do not have permission to view this media file');
    }

    return apiSuccess(record, 'Media file fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const fileType = searchParams.get('fileType');
  const uploadedByParam = searchParams.get('uploadedBy');
  const conditions = [];

  if (search) conditions.push(like(mediaLibrary.name, `%${search}%`));
  if (fileType) conditions.push(eq(mediaLibrary.fileType, fileType));

  if (uploadedByParam) {
    const uploadedBy = Number(uploadedByParam);
    if (!Number.isInteger(uploadedBy) || uploadedBy <= 0) {
      throw new BadRequestError('Valid uploadedBy user id is required');
    }
    if (!isAdminLike && uploadedBy !== user.id) {
      throw new ForbiddenError('You can only filter by your own uploads');
    }
    conditions.push(eq(mediaLibrary.uploadedBy, uploadedBy));
  } else if (!isAdminLike) {
    conditions.push(eq(mediaLibrary.uploadedBy, user.id));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(mediaLibrary);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(mediaLibrary);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(mediaLibrary.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Media files fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createMediaFileSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: created, error } = await supabase.from('media_library').insert({
      name: payload.name.trim(),
      file_url: payload.fileUrl.trim(),
      file_type: payload.fileType,
      file_size: payload.fileSize,
      uploaded_by: actor.authUserId,
      created_at: new Date().toISOString(),
    }).select('*').single();

    if (error || !created) throw error ?? new Error('Failed to create media file');
    const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId]);
    return apiSuccess(normalizeSupabaseMediaRow(created, userMap), 'Media file created successfully', { status: 201 });
  }

  const [created] = await db.insert(mediaLibrary).values({
    name: payload.name,
    fileUrl: payload.fileUrl,
    fileType: payload.fileType,
    fileSize: payload.fileSize,
    uploadedBy: context.auth!.user.id,
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Media file created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const mediaId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new BadRequestError('Valid media item id is required');
  }

  const payload = updateMediaFileSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a media file');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('media_library').select('*').eq('id', mediaId).single();
    if (!existing) throw new NotFoundError('Media file not found');

    const currentUser = context.auth!.user;
    const isCurrentAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin' || currentUser.role === 'Manager';
    if (!isCurrentAdminLike && existing.uploaded_by !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to update this media file');
    }

    const { data: updated, error } = await supabase.from('media_library').update({
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.fileUrl !== undefined ? { file_url: payload.fileUrl.trim() } : {}),
      ...(payload.fileType !== undefined ? { file_type: payload.fileType } : {}),
      ...(payload.fileSize !== undefined ? { file_size: payload.fileSize } : {}),
    }).eq('id', mediaId).select('*').single();

    if (error || !updated) throw error ?? new Error('Failed to update media file');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.uploaded_by)].filter(Boolean));
    return apiSuccess(normalizeSupabaseMediaRow(updated, userMap), 'Media file updated successfully');
  }

  const [existing] = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, mediaId)).limit(1);
  if (!existing) throw new NotFoundError('Media file not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.uploadedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to update this media file');
  }

  const [updated] = await db.update(mediaLibrary).set({
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.fileUrl !== undefined ? { fileUrl: payload.fileUrl } : {}),
    ...(payload.fileType !== undefined ? { fileType: payload.fileType } : {}),
    ...(payload.fileSize !== undefined ? { fileSize: payload.fileSize } : {}),
  }).where(eq(mediaLibrary.id, mediaId)).returning();

  return apiSuccess(updated, 'Media file updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const mediaId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new BadRequestError('Valid media item id is required');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const actor = await getCurrentSupabaseActor(accessToken);
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('media_library').select('*').eq('id', mediaId).single();
    if (!existing) throw new NotFoundError('Media file not found');

    const currentUser = context.auth!.user;
    const isCurrentAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin' || currentUser.role === 'Manager';
    if (!isCurrentAdminLike && existing.uploaded_by !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to delete this media file');
    }

    const { data: deleted, error } = await supabase.from('media_library').delete().eq('id', mediaId).select('*').single();
    if (error || !deleted) throw error ?? new Error('Failed to delete media file');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.uploaded_by)].filter(Boolean));
    return apiSuccess(normalizeSupabaseMediaRow(deleted, userMap), 'Media file deleted successfully');
  }

  const [existing] = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, mediaId)).limit(1);
  if (!existing) throw new NotFoundError('Media file not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.uploadedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this media file');
  }

  const [deleted] = await db.delete(mediaLibrary).where(eq(mediaLibrary.id, mediaId)).returning();
  return apiSuccess(deleted, 'Media file deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
