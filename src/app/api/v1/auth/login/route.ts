import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';
import { loginSchema } from '@/server/validation/auth';
import { loginUser } from '@/server/auth/service';

export const POST = withApiHandler(async (request, context) => {
  const payload = loginSchema.parse(await request.json());
  const result = await loginUser({
    ...payload,
    request,
    requestId: context.requestId,
  });

  return apiSuccess(result, 'Login successful');
});

