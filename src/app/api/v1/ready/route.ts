import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';
import { getPayrollQueueStatus } from '@/server/payroll/queue';
import { getSupabaseAdminClient } from '@/server/supabase/admin';

export const GET = withApiHandler(async () => {
  const supabase = getSupabaseAdminClient() as any;
  const { error } = await supabase.from('tenants').select('id').limit(1);
  if (error) {
    throw error;
  }
  const queue = await getPayrollQueueStatus();

  return apiSuccess({
    status: 'ready',
    database: 'connected',
    queue,
    timestamp: new Date().toISOString(),
  }, 'Service is ready');
});
