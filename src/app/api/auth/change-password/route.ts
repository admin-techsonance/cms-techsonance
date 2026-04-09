import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { changePasswordSchema } from '@/server/validation/auth';
import { changeUserPassword } from '@/server/auth/service';

export const PUT = withApiHandler(async (request, context) => {
  const payload = changePasswordSchema.parse(await request.json());
  await changeUserPassword({
    ...payload,
    request,
    requestId: context.requestId,
  });

  return NextResponse.json({ message: 'Password updated successfully' });
}, { requireAuth: true });
