import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, expenses, projects } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError } from '@/server/http/errors';
import { createExpenseSchema, expenseStatusSchema, updateExpenseSchema } from '@/server/validation/expenses';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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

async function assertSupabaseExpenseRelations(accessToken: string, input: { projectId?: number | null; employeeId?: number | null }) {
  const supabase = getRouteSupabase(accessToken);
  if (input.projectId) {
    const { data } = await supabase.from('projects').select('id').eq('id', input.projectId).single();
    if (!data) throw new NotFoundError('Project not found');
  }
  if (input.employeeId) {
    const { data } = await supabase.from('employees').select('id').eq('id', input.employeeId).single();
    if (!data) throw new NotFoundError('Employee not found');
  }
}

function normalizeSupabaseExpenseRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    category: row.category,
    description: row.description,
    amount: row.amount,
    date: row.date,
    projectId: row.project_id === null ? null : Number(row.project_id),
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    receiptUrl: row.receipt_url ?? null,
    status: row.status,
    createdAt: row.created_at ?? null,
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
      const { data, error } = await supabase.from('expenses').select('*').eq('id', Number(id)).single();
      if (error || !data) throw new NotFoundError('Expense not found');
      return NextResponse.json(normalizeSupabaseExpenseRow(data));
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
    const ascending = searchParams.get('order') === 'asc';
    let query = supabase.from('expenses').select('*', { count: 'exact' });

    if (search) query = query.or(`category.ilike.%${search}%,description.ilike.%${search}%`);
    if (projectId) query = query.eq('project_id', Number(projectId));
    if (employeeId) query = query.eq('employee_id', Number(employeeId));
    if (status) query = query.eq('status', expenseStatusSchema.parse(status));
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, count, error } = await query
      .order(sortField === 'date' ? 'date' : sortField === 'amount' ? 'amount' : sortField === 'category' ? 'category' : 'created_at', { ascending })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const rows = ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabaseExpenseRow);

    if (aggregateBy === 'category') {
      const grouped = Object.values(rows.reduce<Record<string, { category: string; totalAmount: number; count: number }>>((acc, row) => {
        const key = String(row.category);
        acc[key] ??= { category: key, totalAmount: 0, count: 0 };
        acc[key].totalAmount += Number(row.amount ?? 0);
        acc[key].count += 1;
        return acc;
      }, {}));
      return NextResponse.json(grouped);
    }

    if (aggregateBy === 'project') {
      const grouped = Object.values(rows.reduce<Record<string, { projectId: number | null; totalAmount: number; count: number }>>((acc, row) => {
        const key = String(row.projectId ?? 'null');
        acc[key] ??= { projectId: row.projectId, totalAmount: 0, count: 0 };
        acc[key].totalAmount += Number(row.amount ?? 0);
        acc[key].count += 1;
        return acc;
      }, {}));
      return NextResponse.json(grouped);
    }

    return NextResponse.json({
      success: true,
      data: rows,
      message: 'Expenses fetched successfully',
      errors: null,
      meta: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total: Number(count ?? 0),
      },
    });
  }

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

export const POST = withApiHandler(async (request, context) => {
  const payload = createExpenseSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    await assertSupabaseExpenseRelations(accessToken, payload);
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('expenses').insert({
      category: payload.category.trim(),
      description: payload.description.trim(),
      amount: payload.amount,
      date: payload.date,
      project_id: payload.projectId ?? null,
      employee_id: payload.employeeId ?? null,
      receipt_url: payload.receiptUrl?.trim() || null,
      status: payload.status ?? 'pending',
      created_at: new Date().toISOString(),
    }).select('*').single();

    if (error || !data) throw error ?? new Error('Failed to create expense');
    return NextResponse.json(normalizeSupabaseExpenseRow(data), { status: 201 });
  }

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

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');
  const payload = updateExpenseSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existing } = await supabase.from('expenses').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Expense not found');
    await assertSupabaseExpenseRelations(accessToken, { projectId: payload.projectId, employeeId: payload.employeeId });

    const { data, error } = await supabase.from('expenses').update({
      ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
      ...(payload.description !== undefined ? { description: payload.description.trim() } : {}),
      ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.projectId !== undefined ? { project_id: payload.projectId ?? null } : {}),
      ...(payload.employeeId !== undefined ? { employee_id: payload.employeeId ?? null } : {}),
      ...(payload.receiptUrl !== undefined ? { receipt_url: payload.receiptUrl?.trim() || null } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
    }).eq('id', id).select('*').single();

    if (error || !data) throw error ?? new Error('Failed to update expense');
    return NextResponse.json(normalizeSupabaseExpenseRow(data));
  }

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

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Valid expense id is required');

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data, error } = await supabase.from('expenses').delete().eq('id', id).select('*').single();
    if (error || !data) throw new NotFoundError('Expense not found');
    return NextResponse.json({ message: 'Expense deleted successfully', expense: normalizeSupabaseExpenseRow(data) });
  }

  const [deleted] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
  if (!deleted) throw new NotFoundError('Expense not found');
  return NextResponse.json({ message: 'Expense deleted successfully', expense: deleted });
}, { requireAuth: true, roles: ['Manager'] });
