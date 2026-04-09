import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { passwordResetRequestSchema } from '@/server/validation/auth';
import { requestPasswordReset } from '@/server/auth/password-reset';

export const POST = withApiHandler(async (request) => {
  const payload = passwordResetRequestSchema.parse(await request.json());
  const result = await requestPasswordReset(payload.email);

  return NextResponse.json(result);
});
