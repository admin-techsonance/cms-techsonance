import { NextResponse } from 'next/server';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { createEmployeeSchema, employeeStatusSchema, updateEmployeeSchema } from '@/server/validation/employees';

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [employee] = await db.select().from(employees).where(eq(employees.id, Number(id))).limit(1);
    if (!employee) throw new NotFoundError('Employee not found');
    return NextResponse.json(employee);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const userId = searchParams.get('userId');
  const department = searchParams.get('department');
  const status = searchParams.get('status');
  const sortField = searchParams.get('sort') ?? 'createdAt';
  const sortOrder = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = [];

  if (search) conditions.push(or(like(employees.employeeId, `%${search}%`), like(employees.department, `%${search}%`), like(employees.designation, `%${search}%`)));
  if (userId) conditions.push(eq(employees.userId, Number(userId)));
  if (department) conditions.push(like(employees.department, `%${department}%`));
  if (status) conditions.push(eq(employees.status, employeeStatusSchema.parse(status)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(employees);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(employees);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const orderByField = sortField === 'department' ? employees.department :
    sortField === 'designation' ? employees.designation :
    sortField === 'dateOfJoining' ? employees.dateOfJoining :
    sortField === 'status' ? employees.status :
    employees.createdAt;

  const [results, countRows] = await Promise.all([
    query.orderBy(sortOrder(orderByField)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: results,
    message: 'Employees fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createEmployeeSchema.parse(await request.json());
  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!user) throw new NotFoundError('User with provided userId does not exist');

  const [duplicate] = await db.select().from(employees).where(eq(employees.employeeId, payload.employeeId.trim())).limit(1);
  if (duplicate) throw new ConflictError('Employee with this employeeId already exists');

  const now = new Date().toISOString();
  const [created] = await db.insert(employees).values({
    userId: payload.userId,
    employeeId: payload.employeeId.trim(),
    department: payload.department.trim(),
    designation: payload.designation.trim(),
    dateOfJoining: payload.dateOfJoining,
    dateOfBirth: payload.dateOfBirth ?? null,
    skills: payload.skills ? JSON.stringify(payload.skills) : null,
    salary: payload.salary ?? null,
    status: payload.status ?? 'active',
    createdAt: now,
    updatedAt: now,
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid employee id is required');

  const payload = updateEmployeeSchema.parse(await request.json());
  const [existing] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Employee not found');

  if (payload.employeeId && payload.employeeId.trim() !== existing.employeeId) {
    const [duplicate] = await db.select().from(employees).where(eq(employees.employeeId, payload.employeeId.trim())).limit(1);
    if (duplicate) throw new ConflictError('Employee with this employeeId already exists');
  }

  const [updated] = await db.update(employees).set({
    ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId.trim() } : {}),
    ...(payload.department !== undefined ? { department: payload.department.trim() } : {}),
    ...(payload.designation !== undefined ? { designation: payload.designation.trim() } : {}),
    ...(payload.dateOfJoining !== undefined ? { dateOfJoining: payload.dateOfJoining } : {}),
    ...(payload.dateOfBirth !== undefined ? { dateOfBirth: payload.dateOfBirth ?? null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
    ...(payload.skills !== undefined ? { skills: payload.skills ? JSON.stringify(payload.skills) : null } : {}),
    ...(payload.salary !== undefined ? { salary: payload.salary ?? null } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(employees.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid employee id is required');

  const [deleted] = await db.update(employees).set({
    status: 'resigned',
    updatedAt: new Date().toISOString(),
  }).where(eq(employees.id, id)).returning();

  if (!deleted) throw new NotFoundError('Employee not found');

  await db.update(users).set({
    isActive: false,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, deleted.userId));

  return NextResponse.json({
    message: 'Employee resigned and account deactivated successfully',
    employee: deleted,
  });
}, { requireAuth: true, roles: ['Manager'] });

