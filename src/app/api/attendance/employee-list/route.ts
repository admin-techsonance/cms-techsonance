import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { getAdminRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';
import { BadRequestError } from '@/server/http/errors';

export const GET = withApiHandler(async (_request, context) => {
  const accessToken = context.auth?.accessToken;
  const tenantId = context.auth?.user.tenantId;
  if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');

  const supabase = getAdminRouteSupabase();
  const { data: employeeRows, error } = await supabase
    .from('employees')
    .select('id,employee_id,department,user_id')
    .eq('tenant_id', tenantId)
    .order('employee_id', { ascending: true });
  if (error) throw error;
  const rows = (employeeRows as { id: number; employee_id: string; department: string; user_id: string }[] | null) ?? [];
  const profiles = await listSupabaseProfilesByAuthIds(rows.map((row) => row.user_id), { accessToken, tenantId, useAdmin: true });
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
}, { requireAuth: true, roles: ['Employee'] });
