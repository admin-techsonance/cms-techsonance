import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';
import { refreshUserSession } from '@/server/auth/service';

export const POST = withApiHandler(async (request, context) => {
  const result = await refreshUserSession(request, context.requestId);
  return apiSuccess(result, 'Session refreshed successfully');
});

