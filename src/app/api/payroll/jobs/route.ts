import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { BadRequestError } from '@/server/http/errors';
import { getPayrollJob } from '@/server/payroll/queue';

export const GET = withApiHandler(async (request) => {
  const jobId = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new BadRequestError('Valid payroll job id is required');
  }

  const job = await getPayrollJob(jobId);
  return apiSuccess(job, 'Payroll job fetched successfully');
}, { requireAuth: true, roles: ['Admin'] });
