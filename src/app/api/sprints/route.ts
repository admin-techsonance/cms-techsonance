import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projects, sprints } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createSprintSchema, sprintStatusSchema, updateSprintSchema } from '@/server/validation/sprints';

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

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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

export const POST = withApiHandler(async (request) => {
  const payload = createSprintSchema.parse(await request.json());
  await assertProjectExists(payload.projectId);

  if (new Date(payload.endDate) <= new Date(payload.startDate)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  const payload = updateSprintSchema.parse(await request.json());
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

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid sprint id is required');

  const [deleted] = await db.update(sprints).set({
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  }).where(eq(sprints.id, id)).returning();

  if (!deleted) throw new NotFoundError('Sprint not found');
  return NextResponse.json({ message: 'Sprint deleted successfully', sprint: deleted });
}, { requireAuth: true, roles: ['Manager'] });

