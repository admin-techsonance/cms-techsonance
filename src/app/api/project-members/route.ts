import { NextResponse } from 'next/server';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projectMembers, projects, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createProjectMemberSchema, projectMemberRoleSchema, updateProjectMemberSchema } from '@/server/validation/project-members';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
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

export const POST = withApiHandler(async (request) => {
  const payload = createProjectMemberSchema.parse(await request.json());
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

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');
  const payload = updateProjectMemberSchema.parse(await request.json());
  const [updated] = await db.update(projectMembers).set({ role: payload.role }).where(eq(projectMembers.id, id)).returning();
  if (!updated) throw new NotFoundError('Project member not found');
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid project member id is required');
  const [deleted] = await db.delete(projectMembers).where(eq(projectMembers.id, id)).returning();
  if (!deleted) throw new NotFoundError('Project member not found');
  return NextResponse.json({ message: 'Project member removed successfully', member: deleted });
}, { requireAuth: true, roles: ['Manager'] });

