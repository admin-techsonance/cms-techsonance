import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { taskPrioritySchema, taskStatusSchema, createTaskSchema, updateTaskSchema } from '@/server/validation/tasks';
import {
  buildLegacyUserIdMap,
  getAdminRouteSupabase,
  normalizeSupabaseTaskRecord,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

const allowedTransitions: Record<string, string[]> = {
  todo: ['in_progress'],
  in_progress: ['review', 'todo'],
  review: ['done', 'in_progress'],
  done: [],
};

async function assertSupabaseTaskRelations(tenantId: string, accessToken: string, input: {
  projectId?: number;
  assignedTo?: number;
  milestoneId?: number | null;
  sprintId?: number | null;
}) {
  const supabase = getAdminRouteSupabase();

  if (input.projectId !== undefined) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.projectId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Project not found');
  }

  if (input.assignedTo !== undefined) {
    await resolveAuthUserIdFromLegacyUserId(accessToken, input.assignedTo, tenantId);
  }

  if (input.milestoneId !== undefined && input.milestoneId !== null) {
    const { data } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', input.milestoneId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Milestone not found');
  }

  if (input.sprintId !== undefined && input.sprintId !== null) {
    const { data } = await supabase
      .from('sprints')
      .select('id')
      .eq('id', input.sprintId)
      .eq('tenant_id', tenantId)
      .single();
    if (!data) throw new NotFoundError('Sprint not found');
  }
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();

  if (id) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', Number(id))
      .eq('tenant_id', tenantId)
      .single();
    if (error || !data) throw new NotFoundError('Task not found');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.assigned_to)], tenantId);
    return NextResponse.json(normalizeSupabaseTaskRecord(data, userMap));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const sort = searchParams.get('sort') ?? 'id';
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const milestoneId = searchParams.get('milestoneId');
  const sprintId = searchParams.get('sprintId');
  const assignedTo = searchParams.get('assignedTo');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  
  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (milestoneId) query = query.eq('milestone_id', Number(milestoneId));
  if (sprintId) query = query.eq('sprint_id', Number(sprintId));
  if (assignedTo) query = query.eq('assigned_to', await resolveAuthUserIdFromLegacyUserId(accessToken, Number(assignedTo), tenantId));
  if (status) query = query.eq('status', taskStatusSchema.parse(status));
  if (priority) query = query.eq('priority', taskPrioritySchema.parse(priority));

  const { data, count, error } = await query
    .order(
      sort === 'dueDate'
        ? 'due_date'
        : sort === 'priority'
          ? 'priority'
          : sort === 'status'
            ? 'status'
            : 'id',
      { ascending: searchParams.get('order') === 'asc' }
    )
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const userMap = await buildLegacyUserIdMap(
    accessToken,
    ((data as Record<string, unknown>[] | null) ?? []).map((row) => String(row.assigned_to)).filter(Boolean),
    tenantId
  );

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map((row) => normalizeSupabaseTaskRecord(row, userMap)),
    message: 'Tasks fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTaskSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  await assertSupabaseTaskRelations(tenantId, accessToken, payload);
  const supabase = getAdminRouteSupabase();
  const assignedToAuthUserId = await resolveAuthUserIdFromLegacyUserId(accessToken, payload.assignedTo, tenantId);

  const { data, error } = await supabase.from('tasks').insert({
    project_id: payload.projectId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    assigned_to: assignedToAuthUserId,
    milestone_id: payload.milestoneId ?? null,
    sprint_id: payload.sprintId ?? null,
    story_points: payload.storyPoints ?? null,
    due_date: payload.dueDate ?? null,
    status: payload.status ?? 'todo',
    priority: payload.priority ?? 'medium',
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('*').single();

  if (error || !data) throw error ?? new Error('Failed to create task');
  const userMap = await buildLegacyUserIdMap(accessToken, [assignedToAuthUserId], tenantId);
  return NextResponse.json(normalizeSupabaseTaskRecord(data, userMap), { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid task id is required');

  const payload = updateTaskSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingTask) throw new NotFoundError('Task not found');

  await assertSupabaseTaskRelations(tenantId, accessToken, {
    assignedTo: payload.assignedTo,
    milestoneId: payload.milestoneId,
    sprintId: payload.sprintId,
  });

  if (payload.status && payload.status !== existingTask.status) {
    const nextStates = allowedTransitions[existingTask.status] ?? [];
    if (!nextStates.includes(payload.status)) {
      throw new UnprocessableEntityError(`Invalid task status transition from ${existingTask.status} to ${payload.status}`);
    }
  }

  const assignedToAuthUserId = payload.assignedTo !== undefined
    ? await resolveAuthUserIdFromLegacyUserId(accessToken, payload.assignedTo, tenantId)
    : undefined;

  const { data, error } = await supabase.from('tasks').update({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(assignedToAuthUserId !== undefined ? { assigned_to: assignedToAuthUserId } : {}),
    ...(payload.milestoneId !== undefined ? { milestone_id: payload.milestoneId ?? null } : {}),
    ...(payload.sprintId !== undefined ? { sprint_id: payload.sprintId ?? null } : {}),
    ...(payload.storyPoints !== undefined ? { story_points: payload.storyPoints ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.dueDate !== undefined ? { due_date: payload.dueDate ?? null } : {}),
    updated_at: new Date().toISOString(),
    version: Number(existingTask.version ?? 1) + 1,
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();

  if (error || !data) throw error ?? new Error('Failed to update task');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.assigned_to)], tenantId);
  return NextResponse.json(normalizeSupabaseTaskRecord(data, userMap));
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid task id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingTask) throw new NotFoundError('Task not found');
  
  const { data, error } = await supabase
    .from('tasks')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: Number(existingTask.version ?? 1) + 1,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();

  if (error || !data) throw new NotFoundError('Task not found');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.assigned_to)], tenantId);
  return NextResponse.json({ message: 'Task deleted successfully', task: normalizeSupabaseTaskRecord(data, userMap) });
}, { requireAuth: true, roles: ['Manager'] });
