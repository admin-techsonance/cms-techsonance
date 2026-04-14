import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createProjectMemberSchema, projectMemberRoleSchema, updateProjectMemberSchema } from '@/server/validation/project-members';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

function normalizeSupabaseProjectMemberRow(
  row: Record<string, unknown>,
  userMap: Map<string, number | null>
) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    userId,
    role: row.role,
    assignedAt: row.assigned_at ?? null,
  };
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const memberId = Number(id);
    if (!Number.isInteger(memberId) || memberId <= 0) {
      throw new BadRequestError('Valid project member id is required');
    }
    const { data: member, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('id', memberId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !member) throw new NotFoundError('Project member not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(member.user_id)].filter(Boolean), tenantId);
    return NextResponse.json(normalizeSupabaseProjectMemberRow(member, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectId = searchParams.get('projectId');
  const userId = searchParams.get('userId');
  const role = searchParams.get('role');
  const search = searchParams.get('search');
  let query = supabase
    .from('project_members')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (userId) {
    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }
    query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericUserId, tenantId));
  }
  if (role) query = query.eq('role', projectMemberRoleSchema.parse(role));
  if (search) query = query.ilike('role', `%${search}%`);

  const { data, count, error } = await query
    .order('assigned_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean), tenantId);
  return NextResponse.json({
    success: true,
    data: rows.map((row) => normalizeSupabaseProjectMemberRow(row, userMap)),
    message: 'Project members fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectMemberSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId, tenantId);
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', payload.projectId)
    .eq('tenant_id', tenantId)
    .single();
  if (!project) throw new NotFoundError('Project not found');
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUserId)
    .eq('tenant_id', tenantId)
    .single();
  if (!user) throw new NotFoundError('User not found');
  const { data: existing } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', payload.projectId)
    .eq('user_id', authUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) throw new ConflictError('User is already assigned to this project');

  const { data: created, error } = await supabase.from('project_members').insert({
    project_id: payload.projectId,
    user_id: authUserId,
    role: payload.role,
    tenant_id: tenantId,
    assigned_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create project member');
  const userMap = await buildLegacyUserIdMap(accessToken, [authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseProjectMemberRow(created, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');
  const payload = updateProjectMemberSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: updated, error } = await supabase
    .from('project_members')
    .update({ role: payload.role })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !updated) throw new NotFoundError('Project member not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.user_id)].filter(Boolean), tenantId);
  return NextResponse.json(normalizeSupabaseProjectMemberRow(updated, userMap));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw new NotFoundError('Project member not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean), tenantId);
  return NextResponse.json({ message: 'Project member removed successfully', member: normalizeSupabaseProjectMemberRow(deleted, userMap) });
}, { requireAuth: true, roles: ['Manager'] });
