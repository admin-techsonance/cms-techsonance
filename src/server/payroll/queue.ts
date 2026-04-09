import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, payroll, payrollJobs } from '@/db/schema';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';

type PayrollJobScope = 'all' | number[];

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
  const scope: PayrollJobScope = input.employeeIds === 'all' || !input.employeeIds ? 'all' : input.employeeIds;
  const scopeKey = scope === 'all' ? 'all' : scope.slice().sort((a, b) => a - b).join(',');
  const jobKey = `${input.month}:${input.year}:${scopeKey}`;
  const [existing] = await db.select().from(payrollJobs).where(eq(payrollJobs.jobKey, jobKey)).limit(1);
  if (existing) {
    throw new ConflictError('A payroll generation job already exists for this pay period and employee scope');
  }

  const [job] = await db.insert(payrollJobs).values({
    jobKey,
    month: input.month,
    year: input.year,
    employeeScope: scope,
    status: 'pending',
    requestedBy: input.requestedBy,
    requestedAt: new Date().toISOString(),
    result: input.startDate || input.endDate ? { startDate: input.startDate, endDate: input.endDate } : null,
  }).returning();

  return job;
}

export async function processPayrollJob(jobId: number) {
  const [job] = await db.select().from(payrollJobs).where(eq(payrollJobs.id, jobId)).limit(1);
  if (!job) throw new NotFoundError('Payroll job not found');
  if (job.status === 'completed') return job;
  if (job.status === 'processing') return job;

  await db.update(payrollJobs).set({
    status: 'processing',
    startedAt: new Date().toISOString(),
    error: null,
  }).where(eq(payrollJobs.id, jobId));

  try {
    const priorResult = (job.result ?? {}) as { startDate?: string; endDate?: string };
    const { startDate, endDate } = calculateDateRange(job.month, job.year, priorResult.startDate, priorResult.endDate);
    if (new Date(startDate) > new Date(endDate)) {
      throw new UnprocessableEntityError('Payroll startDate must be before or equal to endDate');
    }

    const totalWorkingDays = countWorkingDays(startDate, endDate);
    const scope = job.employeeScope as PayrollJobScope;
    const employeeRows = scope === 'all'
      ? await db.select().from(employees)
      : await db.select().from(employees).where(inArray(employees.id, scope));

    const generated = [];
    for (const employee of employeeRows) {
      if (!employee.salary || employee.salary <= 0) continue;
      const [existingPayroll] = await db.select().from(payroll).where(and(
        eq(payroll.employeeId, employee.id),
        eq(payroll.month, job.month),
        eq(payroll.year, job.year),
      )).limit(1);
      if (existingPayroll) continue;

      const [legacyRecords, nfcRecords] = await Promise.all([
        db.select().from(attendance).where(and(
          eq(attendance.employeeId, employee.id),
          gte(attendance.date, startDate),
          lte(attendance.date, endDate),
        )),
        db.select().from(attendanceRecords).where(and(
          eq(attendanceRecords.employeeId, employee.id),
          gte(attendanceRecords.date, startDate),
          lte(attendanceRecords.date, endDate),
        )),
      ]);

      const byDate = new Map<string, { status: string }>();
      for (const row of legacyRecords) byDate.set(row.date, { status: row.status });
      for (const row of nfcRecords) byDate.set(row.date, { status: row.status });

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
      const calculatedSalary = Math.round((employee.salary / Math.max(totalWorkingDays, 1)) * effectiveDays);
      const [created] = await db.insert(payroll).values({
        employeeId: employee.id,
        month: job.month,
        year: job.year,
        baseSalary: employee.salary,
        presentDays,
        absentDays,
        halfDays,
        leaveDays,
        totalWorkingDays,
        calculatedSalary,
        deductions: 0,
        bonuses: 0,
        netSalary: calculatedSalary,
        status: 'draft',
        generatedBy: job.requestedBy,
        generatedAt: new Date().toISOString(),
      }).returning();
      generated.push(created.id);
    }

    await db.update(payrollJobs).set({
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: {
        startDate,
        endDate,
        generatedPayrollIds: generated,
        processed: generated.length,
      },
    }).where(eq(payrollJobs.id, jobId));
  } catch (error) {
    await db.update(payrollJobs).set({
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }).where(eq(payrollJobs.id, jobId));
    throw error;
  }

  const [updatedJob] = await db.select().from(payrollJobs).where(eq(payrollJobs.id, jobId)).limit(1);
  return updatedJob!;
}

export async function getPayrollJob(jobId: number) {
  const [job] = await db.select().from(payrollJobs).where(eq(payrollJobs.id, jobId)).limit(1);
  if (!job) throw new NotFoundError('Payroll job not found');
  return job;
}

export async function getPayrollQueueStatus() {
  const [pendingRow] = await db.select({ count: sql<number>`count(*)` }).from(payrollJobs).where(eq(payrollJobs.status, 'pending'));
  const [processingRow] = await db.select({ count: sql<number>`count(*)` }).from(payrollJobs).where(eq(payrollJobs.status, 'processing'));
  const [failedRow] = await db.select({ count: sql<number>`count(*)` }).from(payrollJobs).where(eq(payrollJobs.status, 'failed'));

  return {
    pending: Number(pendingRow?.count ?? 0),
    processing: Number(processingRow?.count ?? 0),
    failed: Number(failedRow?.count ?? 0),
  };
}
