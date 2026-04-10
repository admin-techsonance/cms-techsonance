import { getSupabaseAdminClient } from '@/server/supabase/admin';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';

type PayrollJobScope = 'all' | number[];
type QueueRowStatus = 'draft' | 'approved' | 'paid' | 'failed';
type PublicJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

type SupabaseUserRow = {
  id: string;
  tenant_id: string;
  legacy_user_id: number | null;
};

type PayrollJobRow = {
  id: number;
  tenant_id: string;
  job_key: string;
  month: string;
  year: number;
  employee_scope: PayrollJobScope;
  status: QueueRowStatus;
  requested_by: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
};

function getAdmin() {
  return getSupabaseAdminClient() as any;
}

function mapQueueStatus(status: QueueRowStatus): PublicJobStatus {
  switch (status) {
    case 'approved':
      return 'processing';
    case 'paid':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function toQueueStatus(status: PublicJobStatus): QueueRowStatus {
  switch (status) {
    case 'processing':
      return 'approved';
    case 'completed':
      return 'paid';
    case 'failed':
      return 'failed';
    default:
      return 'draft';
  }
}

function normalizeJob(job: PayrollJobRow) {
  return {
    id: Number(job.id),
    tenantId: job.tenant_id,
    jobKey: job.job_key,
    month: job.month,
    year: Number(job.year),
    employeeScope: job.employee_scope,
    status: mapQueueStatus(job.status),
    requestedBy: job.requested_by,
    requestedAt: job.requested_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    result: job.result,
    error: job.error,
  };
}

async function resolveTenantUserByLegacyUserId(legacyUserId: number) {
  const supabase = getAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, tenant_id, legacy_user_id')
    .eq('legacy_user_id', legacyUserId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Requesting user not found');
  }

  return data as SupabaseUserRow;
}

async function getJobById(jobId: number) {
  const supabase = getAdmin();
  const { data, error } = await supabase
    .from('payroll_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    throw new NotFoundError('Payroll job not found');
  }

  return data as PayrollJobRow;
}

function calculateDateRange(month: string, year: number, startDate?: string, endDate?: string) {
  if (startDate && endDate) return { startDate, endDate };
  const [derivedYear, derivedMonth] = month.split('-').map(Number);
  const yearValue = Number.isInteger(derivedYear) ? derivedYear : year;
  const monthValue = Number.isInteger(derivedMonth) ? derivedMonth : 1;
  const firstDay = `${yearValue}-${String(monthValue).padStart(2, '0')}-01`;
  const lastDayNumber = new Date(yearValue, monthValue, 0).getDate();
  const lastDay = `${yearValue}-${String(monthValue).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;
  return { startDate: firstDay, endDate: lastDay };
}

function countWorkingDays(startDate: string, endDate: string) {
  let total = 0;
  for (let current = new Date(startDate); current <= new Date(endDate); current.setDate(current.getDate() + 1)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) total += 1;
  }
  return total;
}

export async function enqueuePayrollGenerationJob(input: {
  month: string;
  year: number;
  employeeIds?: number[] | 'all';
  requestedBy: number;
  startDate?: string;
  endDate?: string;
}) {
  const supabase = getAdmin();
  const requester = await resolveTenantUserByLegacyUserId(input.requestedBy);
  const scope: PayrollJobScope = input.employeeIds === 'all' || !input.employeeIds ? 'all' : input.employeeIds;
  const scopeKey = scope === 'all' ? 'all' : scope.slice().sort((a, b) => a - b).join(',');
  const jobKey = `${input.month}:${input.year}:${scopeKey}`;

  const { data: existing } = await supabase
    .from('payroll_jobs')
    .select('id')
    .eq('tenant_id', requester.tenant_id)
    .eq('job_key', jobKey)
    .maybeSingle();

  if (existing) {
    throw new ConflictError('A payroll generation job already exists for this pay period and employee scope');
  }

  const { data, error } = await supabase
    .from('payroll_jobs')
    .insert({
      tenant_id: requester.tenant_id,
      job_key: jobKey,
      month: input.month,
      year: input.year,
      employee_scope: scope,
      status: toQueueStatus('pending'),
      requested_by: requester.id,
      requested_at: new Date().toISOString(),
      result: input.startDate || input.endDate ? { startDate: input.startDate, endDate: input.endDate } : null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to create payroll job');
  }

  return normalizeJob(data as PayrollJobRow);
}

export async function processPayrollJob(jobId: number) {
  const supabase = getAdmin();
  const job = await getJobById(jobId);

  if (mapQueueStatus(job.status) === 'completed' || mapQueueStatus(job.status) === 'processing') {
    return normalizeJob(job);
  }

  await supabase
    .from('payroll_jobs')
    .update({
      status: toQueueStatus('processing'),
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', jobId);

  try {
    const priorResult = (job.result ?? {}) as { startDate?: string; endDate?: string };
    const { startDate, endDate } = calculateDateRange(job.month, job.year, priorResult.startDate, priorResult.endDate);
    if (new Date(startDate) > new Date(endDate)) {
      throw new UnprocessableEntityError('Payroll startDate must be before or equal to endDate');
    }

    const totalWorkingDays = countWorkingDays(startDate, endDate);
    const scope = job.employee_scope as PayrollJobScope;

    let employeeQuery = supabase
      .from('employees')
      .select('*')
      .eq('tenant_id', job.tenant_id)
      .is('deleted_at', null);
    if (scope !== 'all') {
      employeeQuery = employeeQuery.in('id', scope);
    }

    const { data: employeeRows, error: employeeError } = await employeeQuery;
    if (employeeError) throw employeeError;

    const generated: number[] = [];
    for (const employee of (employeeRows ?? []) as Record<string, any>[]) {
      const salary = employee.salary === null || employee.salary === undefined ? 0 : Number(employee.salary);
      if (salary <= 0) continue;

      const { data: existingPayroll } = await supabase
        .from('payroll')
        .select('id')
        .eq('tenant_id', job.tenant_id)
        .eq('employee_id', employee.id)
        .eq('month', job.month)
        .eq('year', job.year)
        .maybeSingle();
      if (existingPayroll) continue;

      const [{ data: legacyRecords, error: legacyError }, { data: nfcRecords, error: nfcError }] = await Promise.all([
        supabase
          .from('attendance')
          .select('date, status')
          .eq('tenant_id', job.tenant_id)
          .eq('employee_id', employee.id)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('attendance_records')
          .select('date, status')
          .eq('tenant_id', job.tenant_id)
          .eq('employee_id', employee.id)
          .gte('date', startDate)
          .lte('date', endDate),
      ]);

      if (legacyError) throw legacyError;
      if (nfcError) throw nfcError;

      const byDate = new Map<string, { status: string }>();
      for (const row of (legacyRecords ?? []) as Record<string, any>[]) byDate.set(row.date, { status: row.status });
      for (const row of (nfcRecords ?? []) as Record<string, any>[]) byDate.set(row.date, { status: row.status });

      let presentDays = 0;
      let halfDays = 0;
      let leaveDays = 0;
      let absentDays = 0;
      for (const row of byDate.values()) {
        switch (row.status) {
          case 'present':
          case 'late':
            presentDays += 1;
            break;
          case 'half_day':
            halfDays += 1;
            break;
          case 'leave':
          case 'on_leave':
            leaveDays += 1;
            break;
          default:
            absentDays += 1;
        }
      }

      const effectiveDays = presentDays + leaveDays + halfDays * 0.5;
      const calculatedSalary = Number(((salary / Math.max(totalWorkingDays, 1)) * effectiveDays).toFixed(4));

      const { data: created, error: insertError } = await supabase
        .from('payroll')
        .insert({
          tenant_id: job.tenant_id,
          employee_id: employee.id,
          month: job.month,
          year: job.year,
          base_salary: salary,
          present_days: presentDays,
          absent_days: absentDays,
          half_days: halfDays,
          leave_days: leaveDays,
          total_working_days: totalWorkingDays,
          calculated_salary: calculatedSalary,
          deductions: 0,
          bonuses: 0,
          net_salary: calculatedSalary,
          status: 'draft',
          generated_by: job.requested_by,
          generated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError || !created) {
        throw insertError ?? new Error('Failed to insert payroll record');
      }

      generated.push(Number(created.id));
    }

    await supabase
      .from('payroll_jobs')
      .update({
        status: toQueueStatus('completed'),
        completed_at: new Date().toISOString(),
        result: {
          startDate,
          endDate,
          generatedPayrollIds: generated,
          processed: generated.length,
        },
      })
      .eq('id', jobId);
  } catch (error) {
    await supabase
      .from('payroll_jobs')
      .update({
        status: toQueueStatus('failed'),
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', jobId);
    throw error;
  }

  return getPayrollJob(jobId);
}

export async function getPayrollJob(jobId: number) {
  return normalizeJob(await getJobById(jobId));
}

export async function getPayrollQueueStatus() {
  const supabase = getAdmin();
  const [{ count: pending }, { count: processing }, { count: failed }] = await Promise.all([
    supabase.from('payroll_jobs').select('id', { head: true, count: 'exact' }).eq('status', toQueueStatus('pending')),
    supabase.from('payroll_jobs').select('id', { head: true, count: 'exact' }).eq('status', toQueueStatus('processing')),
    supabase.from('payroll_jobs').select('id', { head: true, count: 'exact' }).eq('status', toQueueStatus('failed')),
  ]);

  return {
    pending: Number(pending ?? 0),
    processing: Number(processing ?? 0),
    failed: Number(failed ?? 0),
  };
}
