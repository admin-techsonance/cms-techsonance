import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const GET = withApiHandler(async (_request, context) => {
  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    const supabase = accessToken ? getRouteSupabase(accessToken) : null;
    if (!supabase || !accessToken) {
      return apiSuccess([], 'Attendance employee list fetched successfully');
    }
    const { data: employeeRows, error } = await supabase.from('employees').select('id,employee_id,department,user_id').order('employee_id', { ascending: true });
    if (error) throw error;
    const rows = (employeeRows as { id: number; employee_id: string; department: string; user_id: string }[] | null) ?? [];
    const profiles = await listSupabaseProfilesByAuthIds(rows.map((row) => row.user_id), accessToken);
    return apiSuccess(rows.map((row) => {
      const profile = profiles.get(row.user_id);
      return {
        id: Number(row.id),
        employeeId: row.employee_id,
        department: row.department,
        firstName: profile?.first_name ?? '',
        lastName: profile?.last_name ?? '',
      };
    }), 'Attendance employee list fetched successfully');
  }

  const employeeList = await db.select({
    id: employees.id,
    employeeId: employees.employeeId,
    department: employees.department,
    firstName: users.firstName,
    lastName: users.lastName,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).orderBy(asc(users.firstName), asc(users.lastName));

  return apiSuccess(employeeList, 'Attendance employee list fetched successfully');
}, { requireAuth: true, roles: ['Employee'] });
