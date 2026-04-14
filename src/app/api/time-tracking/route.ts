import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createTimeTrackingSchema, timeTrackingAggregateSchema, updateTimeTrackingSchema } from '@/server/validation/assets';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getAdminRouteSupabase,
  resolveAuthUserIdFromLegacyUserId,
} from '@/server/supabase/route-helpers';

async function getAccessibleSupabaseTask(taskId: number, authUserId: string, isAdminLike: boolean, tenantId: string) {
  const supabase = getAdminRouteSupabase();
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .single();
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  if (!isAdminLike && task.assigned_to !== authUserId) {
    throw new ForbiddenError('You are not assigned to this task');
  }
  return task as Record<string, unknown>;
}

function normalizeSupabaseTimeTrackingRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const userId = typeof row.user_id === 'string' ? userMap.get(row.user_id) ?? null : null;
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    userId,
    hours: row.hours,
    date: row.date,
    description: row.description ?? null,
    createdAt: row.created_at ?? null,
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
    const entryId = Number(id);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      throw new BadRequestError('Valid time entry id is required');
    }
    const { data: entry, error } = await supabase
      .from('time_tracking')
      .select('*')
      .eq('id', entryId)
      .eq('tenant_id', tenantId)
      .single();
    if (error || !entry) throw new NotFoundError('Time entry not found');
    if (!isAdminLike && entry.user_id !== actor.authUserId) {
      throw new ForbiddenError('You do not have permission to view this time entry');
    }
    const userMap = await buildLegacyUserIdMap(accessToken, [String(entry.user_id)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseTimeTrackingRow(entry, userMap), 'Time entry fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const taskIdParam = searchParams.get('taskId');
  const filterUserIdParam = searchParams.get('userId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const aggregateParam = searchParams.get('aggregate');
  let query = supabase
    .from('time_tracking')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (!isAdminLike) {
    query = query.eq('user_id', actor.authUserId);
  } else if (filterUserIdParam) {
    const filterUserId = Number(filterUserIdParam);
    if (!Number.isInteger(filterUserId) || filterUserId <= 0) {
      throw new BadRequestError('Valid user id is required');
    }
    query = query.eq('user_id', await resolveAuthUserIdFromLegacyUserId(accessToken, filterUserId, tenantId));
  }

  if (taskIdParam) {
    const taskId = Number(taskIdParam);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new BadRequestError('Valid task id is required');
    }
    query = query.eq('task_id', taskId);
  }
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, count, error } = await query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.user_id)).filter(Boolean), tenantId);
  const normalized = rows.map((row) => normalizeSupabaseTimeTrackingRow(row, userMap));

  if (aggregateParam) {
    const aggregate = timeTrackingAggregateSchema.parse(aggregateParam);
    const grouped = Object.values(normalized.reduce<Record<string, { id: number | null; totalHours: number; entryCount: number }>>((acc, row) => {
      const key = aggregate === 'task' ? String(row.taskId) : String(row.userId);
      acc[key] ??= {
        id: aggregate === 'task' ? row.taskId : row.userId,
        totalHours: 0,
        entryCount: 0,
      };
      acc[key].totalHours += Number(row.hours ?? 0);
      acc[key].entryCount += 1;
      return acc;
    }, {}));
    return apiSuccess({ aggregateBy: aggregate, results: grouped }, 'Time tracking summary fetched successfully');
  }

  return apiSuccess(normalized, 'Time entries fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createTimeTrackingSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  await getAccessibleSupabaseTask(payload.taskId, actor.authUserId, isAdminLike, tenantId);
  const supabase = getAdminRouteSupabase();
  const { data, error } = await supabase.from('time_tracking').insert({
    task_id: payload.taskId,
    user_id: actor.authUserId,
    hours: payload.hours,
    date: payload.date,
    description: payload.description ?? null,
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  }).select('*').single();
  if (error || !data) throw error ?? new Error('Failed to create time entry');
  const userMap = await buildLegacyUserIdMap(accessToken, [actor.authUserId], tenantId);
  return apiSuccess(normalizeSupabaseTimeTrackingRow(data, userMap), 'Time entry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const entryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new BadRequestError('Valid time entry id is required');
  }

  const payload = updateTimeTrackingSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a time entry');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing, error: existingError } = await supabase
    .from('time_tracking')
    .select('*')
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .single();
  if (existingError || !existing) throw new NotFoundError('Time entry not found');
  if (!isAdminLike && existing.user_id !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to update this time entry');
  }
  if (payload.taskId !== undefined) {
    await getAccessibleSupabaseTask(payload.taskId, actor.authUserId, isAdminLike, tenantId);
  }
  const { data, error } = await supabase.from('time_tracking').update({
    ...(payload.taskId !== undefined ? { task_id: payload.taskId } : {}),
    ...(payload.hours !== undefined ? { hours: payload.hours } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
  })
  .eq('id', entryId)
  .eq('tenant_id', tenantId)
  .select('*')
  .single();
  if (error || !data) throw error ?? new Error('Failed to update time entry');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseTimeTrackingRow(data, userMap), 'Time entry updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const entryId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new BadRequestError('Valid time entry id is required');
  }

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  const actor = await getCurrentSupabaseActor(accessToken);
  const supabase = getAdminRouteSupabase();
  const { data: existing, error: existingError } = await supabase
    .from('time_tracking')
    .select('*')
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .single();
  if (existingError || !existing) throw new NotFoundError('Time entry not found');
  if (!isAdminLike && existing.user_id !== actor.authUserId) {
    throw new ForbiddenError('You do not have permission to delete this time entry');
  }
  const { data, error } = await supabase
    .from('time_tracking')
    .delete()
    .eq('id', entryId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to delete time entry');
  const userMap = await buildLegacyUserIdMap(accessToken, [String(data.user_id)].filter(Boolean), tenantId);
  return apiSuccess(normalizeSupabaseTimeTrackingRow(data, userMap), 'Time entry deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
