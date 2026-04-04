import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const employeeList = await db.select({
      id: employees.id,
      employeeId: employees.employeeId,
      department: employees.department,
      firstName: users.firstName,
      lastName: users.lastName
    })
    .from(employees)
    .innerJoin(users, eq(employees.userId, users.id));

    return NextResponse.json(employeeList, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
