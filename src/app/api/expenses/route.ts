import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, expenses, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createExpenseSchema, expenseStatusSchema, updateExpenseSchema } from '@/server/validation/expenses';

async function assertExpenseRelations(input: { projectId?: number | null; employeeId?: number | null }) {
  if (input.projectId) {
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw new NotFoundError('Project not found');
  }
  if (input.employeeId) {
    const [employee] = await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1);
    if (!employee) throw new NotFoundError('Employee not found');
  }
}

export const GET = withApiHandler(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  if (id) {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, Number(id))).limit(1);
    if (!expense) throw new NotFoundError('Expense not found');
    return NextResponse.json(expense);
  }

  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const search = searchParams.get('search');
  const projectId = searchParams.get('projectId');
  const employeeId = searchParams.get('employeeId');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const aggregateBy = searchParams.get('aggregateBy');
  const sortField = searchParams.get('sort') ?? 'createdAt';
  const sortOrder = searchParams.get('order') === 'asc' ? asc : desc;
  const conditions = [];

  if (search) conditions.push(or(like(expenses.category, `%${search}%`), like(expenses.description, `%${search}%`)));
  if (projectId) conditions.push(eq(expenses.projectId, Number(projectId)));
  if (employeeId) conditions.push(eq(expenses.employeeId, Number(employeeId)));
  if (status) conditions.push(eq(expenses.status, expenseStatusSchema.parse(status)));
  if (startDate) conditions.push(gte(expenses.date, startDate));
  if (endDate) conditions.push(lte(expenses.date, endDate));
  const whereClause = conditions.length ? and(...conditions) : undefined;

  if (aggregateBy === 'category') {
    return NextResponse.json(await db.select({
      category: expenses.category,
      totalAmount: sql<number>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)`,
    }).from(expenses).where(whereClause).groupBy(expenses.category));
  }

  if (aggregateBy === 'project') {
    return NextResponse.json(await db.select({
      projectId: expenses.projectId,
      totalAmount: sql<number>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)`,
    }).from(expenses).where(whereClause).groupBy(expenses.projectId));
  }

  let query = db.select().from(expenses);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(expenses);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const orderByColumn = sortField === 'date' ? expenses.date : sortField === 'amount' ? expenses.amount : sortField === 'category' ? expenses.category : expenses.createdAt;
  const [rows, countRows] = await Promise.all([
    query.orderBy(sortOrder(orderByColumn)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    message: 'Expenses fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request) => {
  const payload = createExpenseSchema.parse(await request.json());
  await assertExpenseRelations(payload);

  const [created] = await db.insert(expenses).values({
    category: payload.category.trim(),
    description: payload.description.trim(),
    amount: payload.amount,
    date: payload.date,
    projectId: payload.projectId ?? null,
    employeeId: payload.employeeId ?? null,
    receiptUrl: payload.receiptUrl?.trim() || null,
    status: payload.status ?? 'pending',
    createdAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Manager'] });

export const PUT = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');
  const payload = updateExpenseSchema.parse(await request.json());
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Expense not found');
  await assertExpenseRelations({ projectId: payload.projectId, employeeId: payload.employeeId });

  const [updated] = await db.update(expenses).set({
    ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
    ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
    ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
    ...(payload.date !== undefined ? { date: payload.date } : {}),
    ...(payload.projectId !== undefined ? { projectId: payload.projectId ?? null } : {}),
    ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId ?? null } : {}),
    ...(payload.receiptUrl !== undefined ? { receiptUrl: payload.receiptUrl?.trim() || null } : {}),
    ...(payload.status !== undefined ? { status: payload.status } : {}),
  }).where(eq(expenses.id, id)).returning();

  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Manager'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');
  const [deleted] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
  if (!deleted) throw new NotFoundError('Expense not found');
  return NextResponse.json({ message: 'Expense deleted successfully', expense: deleted });
}, { requireAuth: true, roles: ['Manager'] });

