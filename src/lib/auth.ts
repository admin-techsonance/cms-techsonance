import { NextRequest } from 'next/server';
import { db } from '@/db';
import { users, sessions, employees } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { UserRole } from './permissions';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  avatarUrl: string | null;
  phone: string | null;
  // Employee details from left join
  employeeRecordId?: number | null;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  dateOfJoining?: string | null;
  dateOfBirth?: string | null;
  skills?: any;
  salary?: number | null;
  status?: string | null;
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

    // Get user with employee details
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        phone: users.phone,
        isActive: users.isActive,
        // Employee fields
        employeeRecordId: employees.id,
        employeeId: employees.employeeId,
        department: employees.department,
        designation: employees.designation,
        dateOfJoining: employees.dateOfJoining,
        dateOfBirth: employees.dateOfBirth,
        skills: employees.skills,
        salary: employees.salary,
        status: employees.status,
      })
      .from(users)
      .leftJoin(employees, eq(users.id, employees.userId))
      .where(eq(users.id, session[0].userId))
      .limit(1);

    if (user.length === 0 || !user[0].isActive) {
      return null;
    }

    // Omit isActive from the returned User type to match the interface
    const { isActive, ...returnUser } = user[0];
    return returnUser as User;
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