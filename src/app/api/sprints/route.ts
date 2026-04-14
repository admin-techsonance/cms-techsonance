import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createSprintSchema, sprintStatusSchema, updateSprintSchema } from '@/server/validation/sprints';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';

const invalidStatusTransitions: Record<string, string[]> = {
  completed: ['planning'],
  cancelled: ['planning', 'active'],
};

function normalizeSupabaseSprintRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    name: row.name,
    goal: row.goal ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    version: row.version ?? 1,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    deletedAt: row.deleted_at ?? null,
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
    const sprintId = Number(id);
    if (!Number.isInteger(sprintId) || sprintId <= 0) {
      throw new BadRequestError('Valid sprint id is required');
    }
    const { data: sprint, error } = await supabase
      .from('sprints')
      .select('*')
      .eq('id', sprintId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !sprint) throw new NotFoundError('Sprint not found');
    return NextResponse.json(normalizeSupabaseSprintRow(sprint));
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const sortField = searchParams.get('sort') ?? 'startDate';
  const ascending = searchParams.get('order') === 'asc';
  
  let query = supabase
    .from('sprints')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (search) query = query.or(`name.ilike.%${search}%,goal.ilike.%${search}%`);
  if (projectId) query = query.eq('project_id', Number(projectId));
  if (status) query = query.eq('status', sprintStatusSchema.parse(status));
  if (startDate) query = query.gte('start_date', startDate);
  if (endDate) query = query.lte('end_date', endDate);

  const sortColumn = sortField === 'name' ? 'name' : sortField === 'status' ? 'status' : sortField === 'endDate' ? 'end_date' : 'start_date';
  const { data, count, error } = await query.order(sortColumn, { ascending }).range(offset, offset + limit - 1);
  if (error) throw error;

  return NextResponse.json({
    success: true,
    data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseSprintRow),
    message: 'Sprints fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createSprintSchema.parse(await request.json());

  if (new Date(payload.endDate) <= new Date(payload.startDate)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', payload.projectId)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!project) throw new NotFoundError('Project not found');

  const now = new Date().toISOString();
  const { data: created, error } = await supabase.from('sprints').insert({
    project_id: payload.projectId,
    name: payload.name.trim(),
    goal: payload.goal?.trim() || null,
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status ?? 'planning',
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  }).select('*').single();
  if (error || !created) throw error ?? new Error('Failed to create sprint');
  return NextResponse.json(normalizeSupabaseSprintRow(created), { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  const payload = updateSprintSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingSprint } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingSprint) throw new NotFoundError('Sprint not found');

  const nextStart = payload.startDate ?? String(existingSprint.start_date);
  const nextEnd = payload.endDate ?? String(existingSprint.end_date);
  if (new Date(nextEnd) <= new Date(nextStart)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  if (payload.status) {
    const invalidTransitions = invalidStatusTransitions[String(existingSprint.status)] ?? [];
    if (invalidTransitions.includes(payload.status)) {
      throw new UnprocessableEntityError(`Cannot transition from ${existingSprint.status} to ${payload.status}`);
    }
  }

  const { data: updated, error } = await supabase.from('sprints').update({
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.goal !== undefined ? { goal: payload.goal?.trim() || null } : {}),
    ...(payload.startDate !== undefined ? { start_date: payload.startDate } : {}),
    ...(payload.endDate !== undefined ? { end_date: payload.endDate } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    version: Number(existingSprint.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
  })
  .eq('id', id)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !updated) throw error ?? new Error('Failed to update sprint');
  return NextResponse.json(normalizeSupabaseSprintRow(updated));
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: deleted, error } = await supabase
    .from('sprints')
    .update({
      status: 'cancelled',
      version: 2,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !deleted) throw new NotFoundError('Sprint not found');
  return NextResponse.json({ message: 'Sprint deleted successfully', sprint: normalizeSupabaseSprintRow(deleted) });
}, { requireAuth: true, roles: ['Manager'] });
