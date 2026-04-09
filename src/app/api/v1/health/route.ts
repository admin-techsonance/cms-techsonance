import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';

export const GET = withApiHandler(async () => {
  return apiSuccess({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }, 'Service is healthy');
});

