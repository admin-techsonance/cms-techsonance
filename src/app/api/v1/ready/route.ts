import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';
import { getPayrollQueueStatus } from '@/server/payroll/queue';

export const GET = withApiHandler(async () => {
  await db.run(sql`select 1`);
  const queue = await getPayrollQueueStatus();

  return apiSuccess({
    status: 'ready',
    database: 'connected',
    queue,
    timestamp: new Date().toISOString(),
  }, 'Service is ready');
});
