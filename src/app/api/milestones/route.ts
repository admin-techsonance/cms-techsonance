import { NextResponse } from 'next/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { milestones, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createMilestoneSchema, milestoneStatusSchema, updateMilestoneSchema } from '@/server/validation/milestones';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [milestone] = await db.select().from(milestones).where(eq(milestones.id, Number(id))).limit(1);
    if (!milestone) throw new NotFoundError('Milestone not found');
    return NextResponse.json(milestone);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const sortField = searchParams.get('sort') ?? 'dueDate';
  const sortOrder = searchParams.get('order') === 'desc' ? desc : asc;
  const conditions = [];
  if (projectId) conditions.push(eq(milestones.projectId, Number(projectId)));
  if (status) conditions.push(eq(milestones.status, milestoneStatusSchema.parse(status)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(milestones);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(milestones);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(sortField === 'createdAt' ? sortOrder(milestones.createdAt) : sortField === 'status' ? sortOrder(milestones.status) : sortOrder(milestones.dueDate)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    message: 'Milestones fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createMilestoneSchema.parse(await request.json());
  const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const dueDateISO = new Date(payload.dueDate).toISOString();
  const now = new Date().toISOString();
  const [created] = await db.insert(milestones).values({
    projectId: payload.projectId,
    title: payload.title.trim(),
    description: payload.description?.trim() || null,
    dueDate: dueDateISO,
    status: payload.status ?? 'pending',
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid milestone id is required');
  const payload = updateMilestoneSchema.parse(await request.json());
  const [existing] = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Milestone not found');

  const [updated] = await db.update(milestones).set({
    ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
    ...(payload.dueDate !== undefined ? { dueDate: new Date(payload.dueDate).toISOString() } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(milestones.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid milestone id is required');
  const [deleted] = await db.delete(milestones).where(eq(milestones.id, id)).returning();
  if (!deleted) throw new NotFoundError('Milestone not found');
  return NextResponse.json({ message: 'Milestone deleted successfully', milestone: deleted });
}, { requireAuth: true, roles: ['Manager'] });

