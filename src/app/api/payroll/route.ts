import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { updatePayrollSchema } from '@/server/validation/payroll';
import { getCurrentSupabaseActor, getAdminRouteSupabase } from '@/server/supabase/route-helpers';

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

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  let query = supabase
    .from('payroll')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (!isAdminLike) {
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', actor.authUserId)
      .eq('tenant_id', tenantId)
      .single();
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
}, { requireAuth: true, roles: ['Employee'] });

export const PUT = withApiHandler(async (request, context) => {
  const payload = updatePayrollSchema.parse(await request.json());

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const actor = await getCurrentSupabaseActor(accessToken);
  const { data: existingPayroll } = await supabase
    .from('payroll')
    .select('*')
    .eq('id', payload.id)
    .eq('tenant_id', tenantId)
    .single();
    
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

  const { data, error } = await supabase
    .from('payroll')
    .update(updateData)
    .eq('id', payload.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error || !data) throw error ?? new Error('Failed to update payroll');
  return NextResponse.json(normalizeSupabasePayrollRow(data));
}, { requireAuth: true, roles: ['Admin'] });

export const DELETE = withApiHandler(async (request, context) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestError('Payroll ID is required');

  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
  
  const supabase = getAdminRouteSupabase();
  const { data: existingPayroll } = await supabase
    .from('payroll')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
    
  if (!existingPayroll) throw new NotFoundError('Payroll not found');
  if (existingPayroll.status !== 'draft') throw new ConflictError('Only draft payrolls can be deleted');
  await supabase
    .from('payroll')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
  return NextResponse.json({ success: true, message: 'Payroll deleted successfully' });
}, { requireAuth: true, roles: ['Admin'] });

