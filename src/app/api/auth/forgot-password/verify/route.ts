import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { passwordResetVerifySchema } from '@/server/validation/auth';
import { verifyPasswordResetOtp } from '@/server/auth/password-reset';

export const POST = withApiHandler(async (request) => {
  const payload = passwordResetVerifySchema.parse(await request.json());
  const result = await verifyPasswordResetOtp(payload);

  return NextResponse.json(result);
});
