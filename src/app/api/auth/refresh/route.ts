import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { refreshUserSession } from '@/server/auth/service';

export const POST = withApiHandler(async (request, context) => {
  const result = await refreshUserSession(request, context.requestId);

  return NextResponse.json({
    message: 'Session refreshed successfully',
    token: result.accessToken,
    accessToken: result.accessToken,
    user: result.user,
  });
});

