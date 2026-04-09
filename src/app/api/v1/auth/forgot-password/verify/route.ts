import { apiSuccess } from '@/server/http/response';
import { withApiHandler } from '@/server/http/handler';
import { passwordResetVerifySchema } from '@/server/validation/auth';
import { verifyPasswordResetOtp } from '@/server/auth/password-reset';

export const POST = withApiHandler(async (request) => {
  const payload = passwordResetVerifySchema.parse(await request.json());
  const result = await verifyPasswordResetOtp(payload);

  return apiSuccess(result, result.message);
});
