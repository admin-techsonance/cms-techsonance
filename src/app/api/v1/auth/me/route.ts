import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';

export const GET = withApiHandler(async (_request, context) => {
  return apiSuccess(context.auth?.user ?? null, 'Authenticated user fetched successfully');
}, { requireAuth: true });

