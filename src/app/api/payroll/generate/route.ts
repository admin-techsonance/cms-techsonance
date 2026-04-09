import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { generatePayrollSchema } from '@/server/validation/payroll';
import { enqueuePayrollGenerationJob, processPayrollJob } from '@/server/payroll/queue';

export const POST = withApiHandler(async (request, context) => {
  const payload = generatePayrollSchema.parse(await request.json());
  const job = await enqueuePayrollGenerationJob({
    month: payload.month,
    year: payload.year,
    employeeIds: payload.employeeIds,
    requestedBy: context.auth!.user.id,
    startDate: payload.startDate,
    endDate: payload.endDate,
  });

  queueMicrotask(() => {
    processPayrollJob(job.id).catch(() => undefined);
  });

  return apiSuccess({
    jobId: job.id,
    status: job.status,
    month: job.month,
    year: job.year,
  }, 'Payroll generation job queued successfully', { status: 202 });
}, { requireAuth: true, roles: ['Admin'] });
