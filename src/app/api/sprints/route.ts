import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projects, sprints } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createSprintSchema, sprintStatusSchema, updateSprintSchema } from '@/server/validation/sprints';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

const invalidStatusTransitions: Record<string, string[]> = {
  completed: ['planning'],
  cancelled: ['planning', 'active'],
};

function sprintFilters(searchParams: URLSearchParams) {
  const conditions = [];
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (search) conditions.push(or(like(sprints.name, `%${search}%`), like(sprints.goal, `%${search}%`)));
  if (projectId) conditions.push(eq(sprints.projectId, Number(projectId)));
  if (status) conditions.push(eq(sprints.status, sprintStatusSchema.parse(status)));
  if (startDate) conditions.push(gte(sprints.startDate, startDate));
  if (endDate) conditions.push(lte(sprints.endDate, endDate));

  return conditions;
}

async function assertProjectExists(projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');
}

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);

    if (id) {
      const sprintId = Number(id);
      if (!Number.isInteger(sprintId) || sprintId <= 0) {
        throw new BadRequestError('Valid sprint id is required');
      }
      const { data: sprint, error } = await supabase.from('sprints').select('*').eq('id', sprintId).single();
      if (error || !sprint) throw new NotFoundError('Sprint not found');
      return NextResponse.json(normalizeSupabaseSprintRow(sprint));
    }

    const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const sortField = searchParams.get('sort') ?? 'startDate';
    const ascending = searchParams.get('order') === 'asc';
    let query = supabase.from('sprints').select('*', { count: 'exact' });
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
  }

  if (id) {
    const [sprint] = await db.select().from(sprints).where(eq(sprints.id, Number(id))).limit(1);
    if (!sprint) throw new NotFoundError('Sprint not found');
    return NextResponse.json(sprint);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const sortField = searchParams.get('sort') ?? 'startDate';
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = sprintFilters(searchParams);
  const whereClause = conditions.length ? and(...conditions) : undefined;

  let query = db.select().from(sprints);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(sprints);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query.orderBy(
      sortField === 'name' ? order(sprints.name) :
      sortField === 'status' ? order(sprints.status) :
      sortField === 'endDate' ? order(sprints.endDate) :
      order(sprints.startDate)
    ).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Sprints fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createSprintSchema.parse(await request.json());

  if (new Date(payload.endDate) <= new Date(payload.startDate)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: project } = await supabase.from('projects').select('id').eq('id', payload.projectId).single();
    if (!project) throw new NotFoundError('Project not found');

    const now = new Date().toISOString();
    const { data: created, error } = await supabase.from('sprints').insert({
      project_id: payload.projectId,
      name: payload.name.trim(),
      goal: payload.goal?.trim() || null,
      start_date: payload.startDate,
      end_date: payload.endDate,
      status: payload.status ?? 'planning',
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to create sprint');
    return NextResponse.json(normalizeSupabaseSprintRow(created), { status: 201 });
  }

  await assertProjectExists(payload.projectId);

  const [created] = await db.insert(sprints).values({
    projectId: payload.projectId,
    name: payload.name.trim(),
    goal: payload.goal?.trim() || null,
    startDate: payload.startDate,
    endDate: payload.endDate,
    status: payload.status ?? 'planning',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  const payload = updateSprintSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existingSprint } = await supabase.from('sprints').select('*').eq('id', id).single();
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
    }).eq('id', id).select('*').single();
    if (error || !updated) throw error ?? new Error('Failed to update sprint');
    return NextResponse.json(normalizeSupabaseSprintRow(updated));
  }

  const [existingSprint] = await db.select().from(sprints).where(eq(sprints.id, id)).limit(1);
  if (!existingSprint) throw new NotFoundError('Sprint not found');

  const nextStart = payload.startDate ?? existingSprint.startDate;
  const nextEnd = payload.endDate ?? existingSprint.endDate;
  if (new Date(nextEnd) <= new Date(nextStart)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  if (payload.status) {
    const invalidTransitions = invalidStatusTransitions[existingSprint.status] ?? [];
    if (invalidTransitions.includes(payload.status)) {
      throw new UnprocessableEntityError(`Cannot transition from ${existingSprint.status} to ${payload.status}`);
    }
  }

  const [updated] = await db.update(sprints).set({
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.goal !== undefined ? { goal: payload.goal?.trim() || null } : {}),
    ...(payload.startDate !== undefined ? { startDate: payload.startDate } : {}),
    ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(sprints.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: deleted, error } = await supabase.from('sprints').update({
      status: 'cancelled',
      version: 2,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single();
    if (error || !deleted) throw new NotFoundError('Sprint not found');
    return NextResponse.json({ message: 'Sprint deleted successfully', sprint: normalizeSupabaseSprintRow(deleted) });
  }

  const [deleted] = await db.update(sprints).set({
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  }).where(eq(sprints.id, id)).returning();

  if (!deleted) throw new NotFoundError('Sprint not found');
  return NextResponse.json({ message: 'Sprint deleted successfully', sprint: deleted });
}, { requireAuth: true, roles: ['Manager'] });
