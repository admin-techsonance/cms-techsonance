import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { projectPrioritySchema, projectStatusSchema, createProjectSchema, updateProjectSchema } from '@/server/validation/projects';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  getCurrentSupabaseActor,
  normalizeSupabaseProjectRecord,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Project not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)], tenantId);
    return NextResponse.json(normalizeSupabaseProjectRecord(data, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const assignedTo = searchParams.get('assignedTo');
  const sortBy = searchParams.get('sort') ?? 'createdAt';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('projects')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  const search = searchParams.get('search');
  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const isActive = searchParams.get('isActive');

  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  if (clientId) query = query.eq('client_id', Number(clientId));
  if (status) query = query.eq('status', projectStatusSchema.parse(status));
  if (priority) query = query.eq('priority', projectPrioritySchema.parse(priority));
  if (startDate) query = query.gte('start_date', startDate);
  if (endDate) query = query.lte('end_date', endDate);
  if (isActive === 'true' || isActive === 'false') query = query.eq('is_active', isActive === 'true');

  if (assignedTo) {
    const authUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, Number(assignedTo), tenantId);
    const { data: memberships, error: membershipError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', authUserId);

    if (membershipError) throw membershipError;
    const projectIds = ((memberships as { project_id: number }[] | null) ?? []).map((row) => row.project_id);
    if (!projectIds.length) {
      return NextResponse.json([]);
    }
    query = query.in('id', projectIds);
  }

  const { data, count, error } = await query
    .order(
      sortBy === 'endDate'
        ? 'end_date'
        : sortBy === 'startDate'
          ? 'start_date'
          : sortBy === 'budget'
            ? 'budget'
            : 'created_at',
      { ascending }
    )
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const userMap = await buildLegacyUserIdMap(
    accessToken,
    ((data as Record<string, unknown>[] | null) ?? []).map((row) => String(row.created_by)).filter(Boolean),
    tenantId
  );
  const normalized = ((data as Record<string, unknown>[] | null) ?? []).map((row) =>
    normalizeSupabaseProjectRecord(row, userMap)
  );

  return NextResponse.json({
    success: true,
    data: normalized,
    message: 'Projects fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  
  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', payload.clientId)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!client) throw new NotFoundError('Client does not exist');

  if (payload.startDate && payload.endDate && new Date(payload.endDate) < new Date(payload.startDate)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('projects').insert({
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    client_id: payload.clientId,
    status: payload.status ?? 'planning',
    priority: payload.priority ?? 'medium',
    start_date: payload.startDate ?? null,
    end_date: payload.endDate ?? null,
    budget: payload.budget ?? null,
    is_active: payload.isActive ?? true,
    tenant_id: tenantId,
    created_by: actor.authUserId,
    created_at: now,
    updated_at: now,
  }).select('*').single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to create project');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return NextResponse.json(normalizeSupabaseProjectRecord(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project id is required');

  const payload = updateProjectSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingProject } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingProject) throw new NotFoundError('Project not found');

  if (payload.clientId !== undefined) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', payload.clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (!client) throw new NotFoundError('Client does not exist');
  }

  const nextStart = payload.startDate ?? existingProject.start_date;
  const nextEnd = payload.endDate ?? existingProject.end_date;
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  const { data, error } = await supabase.from('projects').update({
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.clientId !== undefined ? { client_id: payload.clientId } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.startDate !== undefined ? { start_date: payload.startDate ?? null } : {}),
    ...(payload.endDate !== undefined ? { end_date: payload.endDate ?? null } : {}),
    ...(payload.budget !== undefined ? { budget: payload.budget ?? null } : {}),
    ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw error ? new Error(error.message) : new Error('Failed to update project');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
  return NextResponse.json(normalizeSupabaseProjectRecord(data, userMap));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('projects').update({
    status: 'cancelled',
    is_active: false,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw new NotFoundError('Project not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.created_by)]);
  return NextResponse.json({
    message: 'Project successfully cancelled',
    project: normalizeSupabaseProjectRecord(data, userMap),
  });
}, { requireAuth: true, roles: ['Manager'] });

