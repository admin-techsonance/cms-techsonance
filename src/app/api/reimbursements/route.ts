import { NextResponse } from 'next/server';
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, reimbursementCategories, reimbursements } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/server/http/errors';
import { createReimbursementSchema, updateReimbursementSchema } from '@/server/validation/reimbursements';

function generateRequestId() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RMB-${year}-${random}`;
}

export const GET = withApiHandler(async (request, context) => {
  const currentUser = context.auth!.user;
  const isAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const categoryId = searchParams.get('categoryId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const minAmount = searchParams.get('minAmount');
  const maxAmount = searchParams.get('maxAmount');
  const employeeIdParam = searchParams.get('employeeId');
  const search = searchParams.get('search');
  const conditions = [];

  if (search) conditions.push(or(like(reimbursements.requestId, `%${search}%`), like(reimbursements.description, `%${search}%`)));
  if (!isAdminLike) {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, currentUser.id)).limit(1);
    if (!employee) return NextResponse.json([]);
    conditions.push(eq(reimbursements.employeeId, employee.id));
  } else if (employeeIdParam) {
    conditions.push(eq(reimbursements.employeeId, Number(employeeIdParam)));
  }
  if (status) conditions.push(eq(reimbursements.status, status));
  if (categoryId) conditions.push(eq(reimbursements.categoryId, Number(categoryId)));
  if (startDate) conditions.push(gte(reimbursements.expenseDate, startDate));
  if (endDate) conditions.push(lte(reimbursements.expenseDate, endDate));
  if (minAmount) conditions.push(gte(reimbursements.amount, Number(minAmount)));
  if (maxAmount) conditions.push(lte(reimbursements.amount, Number(maxAmount)));

  const whereClause = conditions.length ? and(...conditions) : undefined;
  let query = db.select().from(reimbursements);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(reimbursements);
  if (whereClause) {
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }
  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(reimbursements.createdAt)),
    countQuery,
  ]);
  return NextResponse.json({ success: true, data: rows, message: 'Reimbursements fetched successfully', errors: null, meta: { page: 1, limit: rows.length || 0, total: Number(countRows[0]?.count ?? 0) } });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const [employee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
  if (!employee) throw new NotFoundError('Employee record not found');
  const payload = createReimbursementSchema.parse(await request.json());
  const [category] = await db.select().from(reimbursementCategories).where(eq(reimbursementCategories.id, payload.categoryId)).limit(1);
  if (!category) throw new NotFoundError('Reimbursement category not found');

  const now = new Date().toISOString();
  const [created] = await db.insert(reimbursements).values({
    requestId: generateRequestId(),
    employeeId: employee.id,
    categoryId: payload.categoryId,
    amount: payload.amount,
    currency: 'INR',
    expenseDate: payload.expenseDate,
    description: payload.description,
    receiptUrl: payload.receiptUrl ?? null,
    status: payload.status ?? 'draft',
    submittedAt: (payload.status ?? 'draft') === 'submitted' ? now : null,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Reimbursement ID is required');
  const payload = updateReimbursementSchema.parse(await request.json());
  const [existing] = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Reimbursement not found');

  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike) {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
    if (!employee || existing.employeeId !== employee.id) throw new ForbiddenError('Unauthorized to update this reimbursement');
    if (existing.status !== 'draft') throw new BadRequestError('Can only edit draft reimbursements');
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (!isAdminLike) {
    if (payload.categoryId !== undefined) updates.categoryId = payload.categoryId;
    if (payload.amount !== undefined) updates.amount = payload.amount;
    if (payload.expenseDate !== undefined) updates.expenseDate = payload.expenseDate;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.receiptUrl !== undefined) updates.receiptUrl = payload.receiptUrl ?? null;
    if (payload.status !== undefined) {
      updates.status = payload.status;
      if (payload.status === 'submitted') updates.submittedAt = now;
    }
  } else {
    if (payload.status !== undefined) {
      updates.status = payload.status;
      updates.reviewedBy = context.auth!.user.id;
      updates.reviewedAt = now;
    }
    if (payload.adminComments !== undefined) updates.adminComments = payload.adminComments ?? null;
  }
  const [updated] = await db.update(reimbursements).set(updates).where(eq(reimbursements.id, id)).returning();
  return NextResponse.json(updated);
}, { requireAuth: true, roles: ['Employee'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Reimbursement ID is required');
  const [existing] = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Reimbursement not found');
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';
  if (!isAdminLike) {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
    if (!employee || existing.employeeId !== employee.id) throw new ForbiddenError('Unauthorized to delete this reimbursement');
    if (existing.status !== 'draft') throw new BadRequestError('Can only delete draft reimbursements');
  }
  await db.delete(reimbursements).where(eq(reimbursements.id, id));
  return NextResponse.json({ message: 'Reimbursement deleted successfully' });
}, { requireAuth: true, roles: ['Employee'] });

