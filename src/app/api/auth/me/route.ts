import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApiHandler } from '@/server/http/handler';
import { getCurrentUser } from '@/lib/auth';

export const GET = withApiHandler(async (request, context) => {
  const user = await getCurrentUser(request as NextRequest);
  return NextResponse.json({ user: user ?? context.auth?.user ?? null });
}, { requireAuth: true });
