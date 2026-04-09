import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, payroll } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { updatePayrollSchema } from '@/server/validation/payroll';

export const GET = withApiHandler(async (request, context) => {
  const currentUser = context.auth!.user;
  const isAdminLike = currentUser.role === 'Admin' || currentUser.role === 'SuperAdmin';
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId');
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const conditions = [];
  if (!isAdminLike) {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, currentUser.id)).limit(1);
    if (!employee) {
      return NextResponse.json([]);
    }
    conditions.push(eq(payroll.employeeId, employee.id));
  } else if (employeeId) {
    conditions.push(eq(payroll.employeeId, parseInt(employeeId)));
  }
  if (month) conditions.push(eq(payroll.month, month));
  if (year) conditions.push(eq(payroll.year, parseInt(year)));
  if (status) conditions.push(eq(payroll.status, status));

  let query = db.select().from(payroll);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(payroll);
  if (conditions.length > 0) {
    const whereClause = and(...conditions);
    query = query.where(whereClause) as typeof query;
    countQuery = countQuery.where(whereClause) as typeof countQuery;
  }

  const [rows, countRows] = await Promise.all([
    query.orderBy(desc(payroll.generatedAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  return NextResponse.json({
    success: true,
    data: rows,
    message: 'Payroll records fetched successfully',
    errors: null,
    meta: {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: Number(countRows[0]?.count ?? 0),
    },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const payload = updatePayrollSchema.parse(await request.json());
  const [existingPayroll] = await db.select().from(payroll).where(eq(payroll.id, payload.id));
  if (!existingPayroll) throw new NotFoundError('Payroll not found');
  if (existingPayroll.status === 'paid') throw new ConflictError('Paid payroll records are immutable');

  const updateData: Record<string, unknown> = {};
  if (payload.deductions !== undefined) updateData.deductions = payload.deductions;
  if (payload.bonuses !== undefined) updateData.bonuses = payload.bonuses;
  if (payload.notes !== undefined) updateData.notes = payload.notes;
  if (payload.deductions !== undefined || payload.bonuses !== undefined) {
    const finalDeductions = payload.deductions ?? existingPayroll.deductions ?? 0;
    const finalBonuses = payload.bonuses ?? existingPayroll.bonuses ?? 0;
    updateData.netSalary = existingPayroll.calculatedSalary - finalDeductions + finalBonuses;
  }
  if (payload.status) {
    updateData.status = payload.status;
    if (payload.status === 'approved' && !existingPayroll.approvedBy) {
      updateData.approvedBy = context.auth!.user.id;
      updateData.approvedAt = new Date().toISOString();
    }
    if (payload.status === 'paid' && !existingPayroll.paidAt) {
      updateData.paidAt = new Date().toISOString();
    }
  }

  const [updatedPayroll] = await db.update(payroll).set(updateData).where(eq(payroll.id, payload.id)).returning();
  return NextResponse.json(updatedPayroll);
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Payroll ID is required');
  const [existingPayroll] = await db.select().from(payroll).where(eq(payroll.id, id));
  if (!existingPayroll) throw new NotFoundError('Payroll not found');
  if (existingPayroll.status !== 'draft') throw new ConflictError('Only draft payrolls can be deleted');
  await db.delete(payroll).where(eq(payroll.id, id));
  return NextResponse.json({ success: true, message: 'Payroll deleted successfully' });
}, { requireAuth: true, roles: ['Admin'] });
