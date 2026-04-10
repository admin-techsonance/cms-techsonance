import { NextResponse } from 'next/server';
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, reimbursementCategories, reimbursements } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, ForbiddenError } from '@/server/http/errors';
import { createReimbursementSchema, updateReimbursementSchema } from '@/server/validation/reimbursements';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import {
  buildLegacyUserIdMap,
  getCurrentSupabaseActor,
  getRouteSupabase,
} from '@/server/supabase/route-helpers';

function generateRequestId() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RMB-${year}-${random}`;
}

function normalizeSupabaseReimbursementRow(row: Record<string, unknown>, userMap: Map<string, number | null>) {
  const reviewedBy = typeof row.reviewed_by === 'string' ? userMap.get(row.reviewed_by) ?? null : null;
  return {
    id: Number(row.id),
    requestId: row.request_id,
    employeeId: Number(row.employee_id),
    categoryId: Number(row.category_id),
    amount: row.amount,
    currency: row.currency ?? 'INR',
    expenseDate: row.expense_date,
    description: row.description,
    receiptUrl: row.receipt_url ?? null,
    status: row.status,
    submittedAt: row.submitted_at ?? null,
    reviewedBy,
    reviewedAt: row.reviewed_at ?? null,
    adminComments: row.admin_comments ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    let query = supabase.from('reimbursements').select('*', { count: 'exact' });

    if (search) query = query.or(`request_id.ilike.%${search}%,description.ilike.%${search}%`);
    if (!isAdminLike) {
      const { data: employee } = await supabase.from('employees').select('id').eq('user_id', actor.authUserId).single();
      if (!employee) return NextResponse.json([]);
      query = query.eq('employee_id', employee.id);
    } else if (employeeIdParam) {
      query = query.eq('employee_id', Number(employeeIdParam));
    }
    if (status) query = query.eq('status', status);
    if (categoryId) query = query.eq('category_id', Number(categoryId));
    if (startDate) query = query.gte('expense_date', startDate);
    if (endDate) query = query.lte('expense_date', endDate);
    if (minAmount) query = query.gte('amount', Number(minAmount));
    if (maxAmount) query = query.lte('amount', Number(maxAmount));

    const { data, count, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const userMap = await buildLegacyUserIdMap(accessToken, rows.map((row) => String(row.reviewed_by)).filter(Boolean));
    return NextResponse.json({ success: true, data: rows.map((row) => normalizeSupabaseReimbursementRow(row, userMap)), message: 'Reimbursements fetched successfully', errors: null, meta: { page: 1, limit: rows.length || 0, total: Number(count ?? 0) } });
  }

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
  const payload = createReimbursementSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    const { data: employee } = await supabase.from('employees').select('id').eq('user_id', actor.authUserId).single();
    if (!employee) throw new NotFoundError('Employee record not found');
    const { data: category } = await supabase.from('reimbursement_categories').select('id').eq('id', payload.categoryId).single();
    if (!category) throw new NotFoundError('Reimbursement category not found');

    const now = new Date().toISOString();
    const { data, error } = await supabase.from('reimbursements').insert({
      request_id: generateRequestId(),
      employee_id: employee.id,
      category_id: payload.categoryId,
      amount: payload.amount,
      currency: 'INR',
      expense_date: payload.expenseDate,
      description: payload.description,
      receipt_url: payload.receiptUrl ?? null,
      status: payload.status ?? 'draft',
      submitted_at: (payload.status ?? 'draft') === 'submitted' ? now : null,
      created_at: now,
      updated_at: now,
    }).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to create reimbursement');
    return NextResponse.json(normalizeSupabaseReimbursementRow(data, new Map()), { status: 201 });
  }

  const [employee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
  if (!employee) throw new NotFoundError('Employee record not found');
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
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    const { data: existing } = await supabase.from('reimbursements').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Reimbursement not found');
    if (!isAdminLike) {
      const { data: employee } = await supabase.from('employees').select('id').eq('user_id', actor.authUserId).single();
      if (!employee || Number(existing.employee_id) !== Number(employee.id)) throw new ForbiddenError('Unauthorized to update this reimbursement');
      if (existing.status !== 'draft') throw new BadRequestError('Can only edit draft reimbursements');
    }
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (!isAdminLike) {
      if (payload.categoryId !== undefined) updates.category_id = payload.categoryId;
      if (payload.amount !== undefined) updates.amount = payload.amount;
      if (payload.expenseDate !== undefined) updates.expense_date = payload.expenseDate;
      if (payload.description !== undefined) updates.description = payload.description;
      if (payload.receiptUrl !== undefined) updates.receipt_url = payload.receiptUrl ?? null;
      if (payload.status !== undefined) {
        updates.status = payload.status;
        if (payload.status === 'submitted') updates.submitted_at = now;
      }
    } else {
      if (payload.status !== undefined) {
        updates.status = payload.status;
        updates.reviewed_by = actor.authUserId;
        updates.reviewed_at = now;
      }
      if (payload.adminComments !== undefined) updates.admin_comments = payload.adminComments ?? null;
    }
    const { data, error } = await supabase.from('reimbursements').update(updates).eq('id', id).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update reimbursement');
    const userMap = await buildLegacyUserIdMap(accessToken, [String(data.reviewed_by)].filter(Boolean));
    return NextResponse.json(normalizeSupabaseReimbursementRow(data, userMap));
  }

  const [existing] = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Reimbursement not found');
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
  const isAdminLike = context.auth!.user.role === 'Admin' || context.auth!.user.role === 'SuperAdmin';

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    const { data: existing } = await supabase.from('reimbursements').select('*').eq('id', id).single();
    if (!existing) throw new NotFoundError('Reimbursement not found');
    if (!isAdminLike) {
      const { data: employee } = await supabase.from('employees').select('id').eq('user_id', actor.authUserId).single();
      if (!employee || Number(existing.employee_id) !== Number(employee.id)) throw new ForbiddenError('Unauthorized to delete this reimbursement');
      if (existing.status !== 'draft') throw new BadRequestError('Can only delete draft reimbursements');
    }
    await supabase.from('reimbursements').delete().eq('id', id);
    return NextResponse.json({ message: 'Reimbursement deleted successfully' });
  }

  const [existing] = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Reimbursement not found');
  if (!isAdminLike) {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
    if (!employee || existing.employeeId !== employee.id) throw new ForbiddenError('Unauthorized to delete this reimbursement');
    if (existing.status !== 'draft') throw new BadRequestError('Can only delete draft reimbursements');
  }
  await db.delete(reimbursements).where(eq(reimbursements.id, id));
  return NextResponse.json({ message: 'Reimbursement deleted successfully' });
}, { requireAuth: true, roles: ['Employee'] });
