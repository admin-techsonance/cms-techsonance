import { NextRequest } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'project_manager' | 'developer' | 'client';
  avatarUrl: string | null;
  phone: string | null;
}

export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');

    if (!sessionToken) {
      return null;
    }

    // Find valid session
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, sessionToken))
      .limit(1);

    if (session.length === 0) {
      return null;
    }

    // Check if session is expired
    const expiresAt = new Date(session[0].expiresAt);
    if (expiresAt < new Date()) {
      return null;
    }

    // Get user
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, session[0].userId))
      .limit(1);

    if (user.length === 0) {
      return null;
    }

    return user[0] as User;
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }
}

export async function getServerUser(): Promise<User | null> {
  // This function is for server components
  // Since we're using bearer tokens, it can't be used in server components
  // Server components should fetch from /api/auth/me with the token
  return null;
}