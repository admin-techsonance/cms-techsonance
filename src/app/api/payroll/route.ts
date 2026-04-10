import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { employees, payroll } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { updatePayrollSchema } from '@/server/validation/payroll';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { getCurrentSupabaseActor, getRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabasePayrollRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    month: row.month,
    year: Number(row.year),
    baseSalary: row.base_salary,
    presentDays: Number(row.present_days ?? 0),
    absentDays: Number(row.absent_days ?? 0),
    halfDays: Number(row.half_days ?? 0),
    leaveDays: Number(row.leave_days ?? 0),
    totalWorkingDays: Number(row.total_working_days ?? 0),
    calculatedSalary: row.calculated_salary,
    deductions: row.deductions,
    bonuses: row.bonuses,
    netSalary: row.net_salary,
    status: row.status,
    generatedBy: row.generated_by ?? null,
    generatedAt: row.generated_at ?? null,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    paidAt: row.paid_at ?? null,
    notes: row.notes ?? null,
  };
}

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    let query = supabase.from('payroll').select('*', { count: 'exact' });

    if (!isAdminLike) {
      const { data: employee } = await supabase.from('employees').select('id').eq('user_id', actor.authUserId).single();
      if (!employee) {
        return NextResponse.json([]);
      }
      query = query.eq('employee_id', employee.id);
    } else if (employeeId) {
      query = query.eq('employee_id', parseInt(employeeId));
    }

    if (month) query = query.eq('month', month);
    if (year) query = query.eq('year', parseInt(year));
    if (status) query = query.eq('status', status);

    const { data, count, error } = await query
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: ((data as Record<string, unknown>[] | null) ?? []).map(normalizeSupabasePayrollRow),
      message: 'Payroll records fetched successfully',
      errors: null,
      meta: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total: Number(count ?? 0),
      },
    });
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const actor = await getCurrentSupabaseActor(accessToken);
    const { data: existingPayroll } = await supabase.from('payroll').select('*').eq('id', payload.id).single();
    if (!existingPayroll) throw new NotFoundError('Payroll not found');
    if (existingPayroll.status === 'paid') throw new ConflictError('Paid payroll records are immutable');

    const updateData: Record<string, unknown> = {};
    if (payload.deductions !== undefined) updateData.deductions = payload.deductions;
    if (payload.bonuses !== undefined) updateData.bonuses = payload.bonuses;
    if (payload.notes !== undefined) updateData.notes = payload.notes;
    if (payload.deductions !== undefined || payload.bonuses !== undefined) {
      const finalDeductions = payload.deductions ?? Number(existingPayroll.deductions ?? 0);
      const finalBonuses = payload.bonuses ?? Number(existingPayroll.bonuses ?? 0);
      updateData.net_salary = Number(existingPayroll.calculated_salary) - finalDeductions + finalBonuses;
    }
    if (payload.status) {
      updateData.status = payload.status;
      if (payload.status === 'approved' && !existingPayroll.approved_by) {
        updateData.approved_by = actor.authUserId;
        updateData.approved_at = new Date().toISOString();
      }
      if (payload.status === 'paid' && !existingPayroll.paid_at) {
        updateData.paid_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase.from('payroll').update(updateData).eq('id', payload.id).select('*').single();
    if (error || !data) throw error ?? new Error('Failed to update payroll');
    return NextResponse.json(normalizeSupabasePayrollRow(data));
  }

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

  if (isSupabaseDatabaseEnabled()) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    const { data: existingPayroll } = await supabase.from('payroll').select('*').eq('id', id).single();
    if (!existingPayroll) throw new NotFoundError('Payroll not found');
    if (existingPayroll.status !== 'draft') throw new ConflictError('Only draft payrolls can be deleted');
    await supabase.from('payroll').delete().eq('id', id);
    return NextResponse.json({ success: true, message: 'Payroll deleted successfully' });
  }

  const [existingPayroll] = await db.select().from(payroll).where(eq(payroll.id, id));
  if (!existingPayroll) throw new NotFoundError('Payroll not found');
  if (existingPayroll.status !== 'draft') throw new ConflictError('Only draft payrolls can be deleted');
  await db.delete(payroll).where(eq(payroll.id, id));
  return NextResponse.json({ success: true, message: 'Payroll deleted successfully' });
}, { requireAuth: true, roles: ['Admin'] });
