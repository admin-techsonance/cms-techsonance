import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { logoutUser } from '@/server/auth/service';

export const POST = withApiHandler(async (request, context) => {
  await logoutUser(request, context.requestId);
  return NextResponse.json({ message: 'Logout successful' });
});
