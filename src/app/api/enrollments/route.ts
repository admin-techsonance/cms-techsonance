import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, nfcTags, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { ConflictError, NotFoundError, BadRequestError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createEnrollmentSchema } from '@/server/validation/devices';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '10'), 1), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const status = searchParams.get('status');
  const employeeIdParam = searchParams.get('employee_id');
  const conditions = [];

  if (status) conditions.push(eq(nfcTags.status, status));
  if (employeeIdParam) {
    const employeeId = Number(employeeIdParam);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestError('Valid employee id is required');
    }
    conditions.push(eq(nfcTags.employeeId, employeeId));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select({
    id: nfcTags.id,
    tagUid: nfcTags.tagUid,
    employeeId: nfcTags.employeeId,
    status: nfcTags.status,
    enrolledAt: nfcTags.enrolledAt,
    enrolledBy: nfcTags.enrolledBy,
    lastUsedAt: nfcTags.lastUsedAt,
    readerId: nfcTags.readerId,
    createdAt: nfcTags.createdAt,
    employee: {
      id: employees.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: employees.department,
    },
  }).from(nfcTags).innerJoin(employees, eq(nfcTags.employeeId, employees.id)).innerJoin(users, eq(employees.userId, users.id));
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(nfcTags);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(nfcTags.enrolledAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return apiSuccess(rows, 'Enrollments fetched successfully', {
    meta: { page: Math.floor(offset / limit) + 1, limit, total: Number(countRows[0]?.count ?? 0) },
  });
}, { requireAuth: true, roles: ['Admin'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createEnrollmentSchema.parse(await request.json());
  const [[employee], [existingTag]] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1),
    db.select().from(nfcTags).where(eq(nfcTags.tagUid, payload.tagUid)).limit(1),
  ]);
  if (!employee) throw new NotFoundError('Employee not found');
  if (existingTag) throw new ConflictError('NFC tag is already enrolled');

  const now = new Date().toISOString();
  const [created] = await db.insert(nfcTags).values({
    tagUid: payload.tagUid,
    employeeId: payload.employeeId,
    status: 'active',
    enrolledAt: now,
    enrolledBy: context.auth!.user.id,
    createdAt: now,
  }).returning();

  return apiSuccess(created, 'Enrollment created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });
