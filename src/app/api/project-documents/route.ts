import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createProjectDocumentSchema, updateProjectDocumentSchema } from '@/server/validation/assets';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseProjectDocumentRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const uploadedBy = typeof row.uploaded_by === 'string' ? userMap.get(row.uploaded_by) ?? null : null;

  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    name: row.name,
    fileUrl: row.file_url,
    uploadedBy,
    uploadedAt: row.uploaded_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const tenantId = user.tenantId;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();

  if (id) {
    const documentId = Number(id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      throw new BadRequestError('Valid project document id is required');
    }

    const { data: document, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !document) throw new NotFoundError('Project document not found');
    if (!isAdminLike && document.uploaded_by !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to view this project document');
    }

    const userMap = await buildLegacyUserIdMap(accessToken, [String(document.uploaded_by)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseProjectDocumentRow(document, userMap), 'Project document fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectIdParam = searchParams.get('projectId');
  const uploadedByParam = searchParams.get('uploadedBy');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') === 'name' ? 'name' : 'uploaded_at';
  const ascending = searchParams.get('order') === 'asc';
  let query = supabase
    .from('project_documents')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (projectIdParam) {
    const projectId = Number(projectIdParam);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new BadRequestError('Valid project id is required');
    }
    query = query.eq('project_id', projectId);
  }

  if (uploadedByParam) {
    const uploadedBy = Number(uploadedByParam);
    if (!Number.isInteger(uploadedBy) || uploadedBy <= 0) {
      throw new BadRequestError('Valid uploadedBy user id is required');
    }
    if (!isAdminLike && uploadedBy !== user.id) {
      throw new ForbiddenError('You can only filter by your own uploads');
    }
    query = query.eq('uploaded_by', await resolveAuthUserIdFromLegacyUserId(accessToken, uploadedBy, tenantId));
  } else if (!isAdminLike) {
    query = query.eq('uploaded_by', actor.authUserId);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,file_url.ilike.%${search}%`);
  }

  const { data, count, error } = await query
    .order(sort, { ascending })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.uploaded_by)).filter(Boolean), tenantId);

  return apiSuccess(
    rows.map((row) => normalizeSupabaseProjectDocumentRow(row, userMap)),
    'Project documents fetched successfully',
    { meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) } }
  );
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectDocumentSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', payload.projectId)
    .eq('tenant_id', tenantId)
    .single();
  if (!project) throw new NotFoundError('Project not found');

  const { data: created, error } = await supabase.from('project_documents').insert({
    project_id: payload.projectId,
    name: payload.name.trim(),
    file_url: payload.fileUrl.trim(),
    uploaded_by: actor.authUserId,
    tenant_id: tenantId,
    uploaded_at: new Date().toISOString(),
  }).select('*').single();

  if (error || !created) throw error ?? new Error('Failed to create project document');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return apiSuccess(normalizeSupabaseProjectDocumentRow(created, userMap), 'Project document created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const documentId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new BadRequestError('Valid project document id is required');
  }

  const payload = updateProjectDocumentSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a project document');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('project_documents')
    .select('*')
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Project document not found');

  const currentUser = context.auth!.user;
  const isCurrentAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin' || currentUser.role === 'Manager';
  if (!isCurrentAdminLike && existing.uploaded_by !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to update this project document');
  }

  if (payload.projectId !== undefined) {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', payload.projectId)
      .eq('tenant_id', tenantId)
      .single();
    if (!project) throw new NotFoundError('Project not found');
  }

  const { data: updated, error } = await supabase.from('project_documents').update({
    ...(payload.projectId !== undefined ? { project_id: payload.projectId } : {}),
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.fileUrl !== undefined ? { file_url: payload.fileUrl.trim() } : {}),
  })
  .eq('id', documentId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !updated) throw error ?? new Error('Failed to update project document');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.uploaded_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseProjectDocumentRow(updated, userMap), 'Project document updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const documentId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new BadRequestError('Valid project document id is required');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing } = await supabase
    .from('project_documents')
    .select('*')
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .single();
  if (!existing) throw new NotFoundError('Project document not found');

  const currentUser = context.auth!.user;
  const isCurrentAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin' || currentUser.role === 'Manager';
  if (!isCurrentAdminLike && existing.uploaded_by !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to delete this project document');
  }

  const { data: deleted, error } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw error ?? new Error('Failed to delete project document');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.uploaded_by)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseProjectDocumentRow(deleted, userMap), 'Project document deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
