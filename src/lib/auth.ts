import { NextRequest } from 'next/server';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateRequest } from '@/server/auth/session';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarUrl: string | null;
  phone: string | null;
  employeeRecordId?: number | null;
  employeeId?: string | null;
  department?: string | null;
  designation?: string | null;
  dateOfJoining?: string | null;
  dateOfBirth?: string | null;
  skills?: unknown;
  salary?: number | null;
  status?: string | null;
}

export async function getCurrentUser(request: NextRequest): Promise<User | null> {
  try {
    const auth = await authenticateRequest(request, { required: false });

    if (!auth) {
      return null;
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        phone: users.phone,
        isActive: users.isActive,
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
      .where(eq(users.id, auth.user.id))
      .limit(1);

    if (!user || !user.isActive) {
      return null;
    }

    const { isActive, ...rest } = user;
    return rest;
  } catch {
    return null;
  }
}

export async function getServerUser(): Promise<User | null> {
  return null;
}

