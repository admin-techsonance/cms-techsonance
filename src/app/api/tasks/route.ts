import { NextResponse } from 'next/server';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { milestones, projects, sprints, tasks, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { createTaskSchema, taskPrioritySchema, taskStatusSchema, updateTaskSchema } from '@/server/validation/tasks';

const allowedTransitions: Record<string, string[]> = {
  todo: ['in_progress'],
  in_progress: ['review', 'todo'],
  review: ['done', 'in_progress'],
  done: [],
};

async function assertTaskRelations(input: {
  projectId?: number;
  assignedTo?: number;
  milestoneId?: number | null;
  sprintId?: number | null;
}) {
  if (input.projectId !== undefined) {
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');
  }

  if (input.assignedTo !== undefined) {
    const [assignee] = await db.select().from(users).where(eq(users.id, input.assignedTo)).limit(1);
    if (!assignee) throw new NotFoundError('Assigned user not found');
  }

  if (input.milestoneId !== undefined && input.milestoneId !== null) {
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, input.milestoneId)).limit(1);
    if (!milestone) throw new NotFoundError('Milestone not found');
  }

  if (input.sprintId !== undefined && input.sprintId !== null) {
    const [sprint] = await db.select().from(sprints).where(eq(sprints.id, input.sprintId)).limit(1);
    if (!sprint) throw new NotFoundError('Sprint not found');
  }
}

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, Number(id))).limit(1);
    if (!task) throw new NotFoundError('Task not found');
    return NextResponse.json(task);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const sort = searchParams.get('sort') ?? 'id';
  const order = searchParams.get('order') === 'asc' ? asc : desc;
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const milestoneId = searchParams.get('milestoneId');
  const sprintId = searchParams.get('sprintId');
  const assignedTo = searchParams.get('assignedTo');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const conditions = [];

  if (search) conditions.push(or(like(tasks.title, `%${search}%`), like(tasks.description, `%${search}%`)));
  if (projectId) conditions.push(eq(tasks.projectId, Number(projectId)));
  if (milestoneId) conditions.push(eq(tasks.milestoneId, Number(milestoneId)));
  if (sprintId) conditions.push(eq(tasks.sprintId, Number(sprintId)));
  if (assignedTo) conditions.push(eq(tasks.assignedTo, Number(assignedTo)));
  if (status) conditions.push(eq(tasks.status, taskStatusSchema.parse(status)));
  if (priority) conditions.push(eq(tasks.priority, taskPrioritySchema.parse(priority)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(tasks);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(tasks);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [results, countRows] = await Promise.all([
    query
      .orderBy(
        sort === 'dueDate' ? order(tasks.dueDate) :
        sort === 'priority' ? order(tasks.priority) :
        sort === 'status' ? order(tasks.status) :
        order(tasks.id)
      )
      .limit(limit)
      .offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Tasks fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createTaskSchema.parse(await request.json());
  await assertTaskRelations(payload);

  const [created] = await db.insert(tasks).values({
    projectId: payload.projectId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    assignedTo: payload.assignedTo,
    milestoneId: payload.milestoneId ?? null,
    sprintId: payload.sprintId ?? null,
    storyPoints: payload.storyPoints ?? null,
    dueDate: payload.dueDate ?? null,
    status: payload.status ?? 'todo',
    priority: payload.priority ?? 'medium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid task id is required');

  const payload = updateTaskSchema.parse(await request.json());
  const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existingTask) throw new NotFoundError('Task not found');

  await assertTaskRelations({
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

  const [updated] = await db.update(tasks).set({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.assignedTo !== undefined ? { assignedTo: payload.assignedTo } : {}),
    ...(payload.milestoneId !== undefined ? { milestoneId: payload.milestoneId ?? null } : {}),
    ...(payload.sprintId !== undefined ? { sprintId: payload.sprintId ?? null } : {}),
    ...(payload.storyPoints !== undefined ? { storyPoints: payload.storyPoints ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
    ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate ?? null } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(tasks.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid task id is required');

  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!deleted) throw new NotFoundError('Task not found');
  return NextResponse.json({ message: 'Task deleted successfully', task: deleted });
}, { requireAuth: true, roles: ['Manager'] });

