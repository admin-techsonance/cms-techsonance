import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projectMembers, projects, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createProjectMemberSchema, projectMemberRoleSchema, updateProjectMemberSchema } from '@/server/validation/project-members';
import {
  buildLegacyUserIdMap,
  getRouteSupabase,
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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const memberId = Number(id);
      if (!Number.isInteger(memberId) || memberId <= 0) {
        throw new BadRequestError('Valid project member id is required');
      }
      const { data: member, error } = await supabase.from('project_members').select('*').eq('id', memberId).single();
      if (error || !member) throw new NotFoundError('Project member not found');
      const userMap = await buildLegacyUserIdMap(accessToken, [String(member.user_id)].filter(Boolean));
      return NextResponse.json(normalizeSupabaseProjectMemberRow(member, userMap));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    let query = supabase.from('project_members').select('*', { count: 'exact' });
    if (projectId) query = query.eq('project_id', Number(projectId));
    if (userId) {
      const numericUserId = Number(userId);
      if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        throw new BadRequestError('Valid user id is required');
      }
      query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, numericUserId));
    }
    if (role) query = query.eq('role', projectMemberRoleSchema.parse(role));
    if (search) query = query.ilike('role', `%${search}%`);

    const { data, count, error } = await query
      .order('assigned_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean));
    return NextResponse.json({
      success: true,
      data: rows.map((row) => normalizeSupabaseProjectMemberRow(row, userMap)),
      message: 'Project members fetched successfully',
      errors: null,
      meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
    });
  }

  if (id) {
    const [member] = await db.select().from(projectMembers).where(eq(projectMembers.id, Number(id))).limit(1);
    if (!member) throw new NotFoundError('Project member not found');
    return NextResponse.json(member);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectId = searchParams.get('projectId');
  const userId = searchParams.get('userId');
  const role = searchParams.get('role');
  const search = searchParams.get('search');
  const conditions = [];
  if (projectId) conditions.push(eq(projectMembers.projectId, Number(projectId)));
  if (userId) conditions.push(eq(projectMembers.userId, Number(userId)));
  if (role) conditions.push(eq(projectMembers.role, projectMemberRoleSchema.parse(role)));
  if (search) conditions.push(or(like(projectMembers.role, `%${search}%`)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(projectMembers);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(projectMembers);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(projectMembers.assignedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    message: 'Project members fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectMemberSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.userId);
    const { data: project } = await supabase.from('projects').select('id').eq('id', payload.projectId).single();
    if (!project) throw new NotFoundError('Project not found');
    const { data: user } = await supabase.from('users').select('id').eq('id', authUserId).single();
    if (!user) throw new NotFoundError('User not found');
    const { data: existing } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', payload.projectId)
      .eq('user_id', authUserId)
      .single();
    if (existing) throw new ConflictError('User is already assigned to this project');

    const { data: created, error } = await supabase.from('project_members').insert({
      project_id: payload.projectId,
      user_id: authUserId,
      role: payload.role,
      assigned_at: new Date().toISOString(),
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create project member');
    const userMap = await buildLegacyUserIdMap(accessToken, [authUserId]);
    return NextResponse.json(normalizeSupabaseProjectMemberRow(created, userMap), { status: 201 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) throw new NotFoundError('User not found');
  const [existing] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, payload.projectId), eq(projectMembers.userId, payload.userId))).limit(1);
  if (existing) throw new ConflictError('User is already assigned to this project');

  const [created] = await db.insert(projectMembers).values({
    projectId: payload.projectId,
    userId: payload.userId,
    role: payload.role,
    assignedAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');
  const payload = updateProjectMemberSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: updated, error } = await supabase.from('project_members').update({ role: payload.role }).eq('id', id).select('*').single();
    if (error || !updated) throw new NotFoundError('Project member not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(updated.user_id)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseProjectMemberRow(updated, userMap));
  }

  const [updated] = await db.update(projectMembers).set({ role: payload.role }).where(eq(projectMembers.id, id)).returning();
  if (!updated) throw new NotFoundError('Project member not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('project_members').delete().eq('id', id).select('*').single();
    if (error || !deleted) throw new NotFoundError('Project member not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(deleted.user_id)].filter(Boolean));
    return NextResponse.json({ message: 'Project member removed successfully', member: normalizeSupabaseProjectMemberRow(deleted, userMap) });
  }

  const [deleted] = await db.delete(projectMembers).where(eq(projectMembers.id, id)).returning();
  if (!deleted) throw new NotFoundError('Project member not found');
  return NextResponse.json({ message: 'Project member removed successfully', member: deleted });
}, { requireAuth: true, roles: ['Manager'] });
