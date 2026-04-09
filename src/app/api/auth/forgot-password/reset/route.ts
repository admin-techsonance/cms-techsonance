import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { passwordResetCompleteSchema } from '@/server/validation/auth';
import { resetPasswordWithOtp } from '@/server/auth/password-reset';

export const POST = withApiHandler(async (request) => {
  const payload = passwordResetCompleteSchema.parse(await request.json());
  const result = await resetPasswordWithOtp({
    email: payload.email,
    otp: payload.otp,
    newPassword: payload.newPassword,
  });

  return NextResponse.json(result);
});
