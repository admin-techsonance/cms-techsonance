import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { projectDocuments, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createProjectDocumentSchema, updateProjectDocumentSchema } from '@/server/validation/assets';

export const GET = withApiHandler(async (request, context) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';

  if (id) {
    const documentId = Number(id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      throw new BadRequestError('Valid project document id is required');
    }

    const [document] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, documentId)).limit(1);
    if (!document) throw new NotFoundError('Project document not found');
    if (!isAdminLike && document.uploadedBy !== user.id) {
      throw new ForbiddenError('You do not have permission to view this project document');
    }

    return apiSuccess(document, 'Project document fetched successfully');
  }

  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const projectIdParam = searchParams.get('projectId');
  const uploadedByParam = searchParams.get('uploadedBy');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') === 'name' ? 'name' : 'uploadedAt';
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const conditions = [];

  if (projectIdParam) {
    const projectId = Number(projectIdParam);
    if (!Number.isInteger(projectId) || projectId <= 0) throw new BadRequestError('Valid project id is required');
    conditions.push(eq(projectDocuments.projectId, projectId));
  }

  if (uploadedByParam) {
    const uploadedBy = Number(uploadedByParam);
    if (!Number.isInteger(uploadedBy) || uploadedBy <= 0) throw new BadRequestError('Valid uploadedBy user id is required');
    if (!isAdminLike && uploadedBy !== user.id) throw new ForbiddenError('You can only filter by your own uploads');
    conditions.push(eq(projectDocuments.uploadedBy, uploadedBy));
  } else if (!isAdminLike) {
    conditions.push(eq(projectDocuments.uploadedBy, user.id));
  }

  if (search) {
    conditions.push(or(like(projectDocuments.name, `%${search}%`), like(projectDocuments.fileUrl, `%${search}%`))!);
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(projectDocuments);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(projectDocuments);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const orderByColumn = sort === 'name' ? projectDocuments.name : projectDocuments.uploadedAt;
  const [rows, countRows] = await Promise.all([
    query.orderBy(order === 'asc' ? asc(orderByColumn) : desc(orderByColumn)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Project documents fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createProjectDocumentSchema.parse(await request.json());
  const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
  if (!project) throw new NotFoundError('Project not found');

  const [created] = await db.insert(projectDocuments).values({
    projectId: payload.projectId,
    name: payload.name,
    fileUrl: payload.fileUrl,
    uploadedBy: context.auth!.user.id,
    uploadedAt: new Date().toISOString(),
  }).returning();

  return apiSuccess(created, 'Project document created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const documentId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new BadRequestError('Valid project document id is required');
  }

  const payload = updateProjectDocumentSchema.parse(await request.json());
  if (Object.keys(payload).length === 0) {
    throw new BadRequestError('At least one field is required to update a project document');
  }

  const [existing] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, documentId)).limit(1);
  if (!existing) throw new NotFoundError('Project document not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.uploadedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to update this project document');
  }

  if (payload.projectId !== undefined) {
    const [project] = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');
  }

  const [updated] = await db.update(projectDocuments).set({
    ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.fileUrl !== undefined ? { fileUrl: payload.fileUrl } : {}),
  }).where(eq(projectDocuments.id, documentId)).returning();

  return apiSuccess(updated, 'Project document updated successfully');
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const documentId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new BadRequestError('Valid project document id is required');
  }

  const [existing] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, documentId)).limit(1);
  if (!existing) throw new NotFoundError('Project document not found');

  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike && existing.uploadedBy !== user.id) {
    throw new ForbiddenError('You do not have permission to delete this project document');
  }

  const [deleted] = await db.delete(projectDocuments).where(eq(projectDocuments.id, documentId)).returning();
  return apiSuccess(deleted, 'Project document deleted successfully');
}, { requireAuth: true, roles: ['Employee'] });
