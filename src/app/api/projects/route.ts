import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { clients, projectMembers, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createProjectSchema, projectPrioritySchema, projectStatusSchema, updateProjectSchema } from '@/server/validation/projects';

function buildProjectFilters(searchParams: URLSearchParams) {
  const conditions = [];
  const search = searchParams.get('search');
  const clientId = searchParams.get('clientId');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const createdBy = searchParams.get('createdBy');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const isActive = searchParams.get('isActive');

  if (search) {
    conditions.push(or(like(projects.name, `%${search}%`), like(projects.description, `%${search}%`)));
  }
  if (clientId) conditions.push(eq(projects.clientId, Number(clientId)));
  if (status) conditions.push(eq(projects.status, projectStatusSchema.parse(status)));
  if (priority) conditions.push(eq(projects.priority, projectPrioritySchema.parse(priority)));
  if (createdBy) conditions.push(eq(projects.createdBy, Number(createdBy)));
  if (startDate) conditions.push(gte(projects.startDate, startDate));
  if (endDate) conditions.push(lte(projects.endDate, endDate));
  if (isActive === 'true' || isActive === 'false') conditions.push(eq(projects.isActive, isActive === 'true'));

  return conditions;
}

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');

  if (id) {
    const [project] = await db.select().from(projects).where(eq(projects.id, Number(id))).limit(1);
    if (!project) throw new NotFoundError('Project not found');
    return NextResponse.json(project);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const assignedTo = searchParams.get('assignedTo');
  const sortBy = searchParams.get('sort') ?? 'createdAt';
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = buildProjectFilters(searchParams);
  const whereClause = conditions.length ? and(...conditions) : undefined;

  if (assignedTo) {
    const baseWhere = and(eq(projectMembers.userId, Number(assignedTo)), ...(whereClause ? [whereClause] : []));
    const results = await db.select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      clientId: projects.clientId,
      status: projects.status,
      priority: projects.priority,
      startDate: projects.startDate,
      endDate: projects.endDate,
      budget: projects.budget,
      isActive: projects.isActive,
      createdBy: projects.createdBy,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    }).from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .where(baseWhere)
      .orderBy(sortBy === 'endDate' ? order(projects.endDate) : sortBy === 'startDate' ? order(projects.startDate) : sortBy === 'budget' ? order(projects.budget) : order(projects.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results);
  }

  let query = db.select().from(projects);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(projects);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query
      .orderBy(sortBy === 'endDate' ? order(projects.endDate) : sortBy === 'startDate' ? order(projects.startDate) : sortBy === 'budget' ? order(projects.budget) : order(projects.createdAt))
      .limit(limit)
      .offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Projects fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectSchema.parse(await request.json());
  const [client] = await db.select().from(clients).where(eq(clients.id, payload.clientId)).limit(1);
  if (!client) throw new NotFoundError('Client does not exist');

  if (payload.startDate && payload.endDate && new Date(payload.endDate) < new Date(payload.startDate)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  const now = new Date().toISOString();
  const [created] = await db.insert(projects).values({
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    clientId: payload.clientId,
    status: payload.status ?? 'planning',
    priority: payload.priority ?? 'medium',
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    budget: payload.budget ?? null,
    isActive: payload.isActive ?? true,
    createdBy: context.auth!.user.id,
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project id is required');

  const payload = updateProjectSchema.parse(await request.json());
  const [existingProject] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!existingProject) throw new NotFoundError('Project not found');

  if (payload.clientId !== undefined) {
    const [client] = await db.select().from(clients).where(eq(clients.id, payload.clientId)).limit(1);
    if (!client) throw new NotFoundError('Client does not exist');
  }

  const nextStart = payload.startDate ?? existingProject.startDate;
  const nextEnd = payload.endDate ?? existingProject.endDate;
  if (nextStart && nextEnd && new Date(nextEnd) < new Date(nextStart)) {
    throw new UnprocessableEntityError('End date must be after start date');
  }

  const [updated] = await db.update(projects).set({
    ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.clientId !== undefined ? { clientId: payload.clientId } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.startDate !== undefined ? { startDate: payload.startDate ?? null } : {}),
    ...(payload.endDate !== undefined ? { endDate: payload.endDate ?? null } : {}),
    ...(payload.budget !== undefined ? { budget: payload.budget ?? null } : {}),
    ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project id is required');

  const [deleted] = await db.update(projects).set({
    status: 'cancelled',
    isActive: false,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, id)).returning();

  if (!deleted) throw new NotFoundError('Project not found');

  return NextResponse.json({
    message: 'Project successfully cancelled',
    project: deleted,
  });
}, { requireAuth: true, roles: ['Manager'] });

