import { NextResponse } from 'next/server';
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

  return NextResponse.json({
    message: 'Login successful',
    token: result.accessToken,
    accessToken: result.accessToken,
    user: result.user,
  });
});
