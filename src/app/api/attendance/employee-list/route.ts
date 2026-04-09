import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';

export const GET = withApiHandler(async () => {
  const employeeList = await db.select({
    id: employees.id,
    employeeId: employees.employeeId,
    department: employees.department,
    firstName: users.firstName,
    lastName: users.lastName,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).orderBy(asc(users.firstName), asc(users.lastName));

  return apiSuccess(employeeList, 'Attendance employee list fetched successfully');
}, { requireAuth: true, roles: ['Employee'] });
