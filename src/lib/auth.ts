import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/server/auth/session';
import { getRouteSupabase } from '@/server/supabase/route-helpers';

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
    if (!auth) return null;

    const supabase = getRouteSupabase(auth.accessToken);
    const providerUserId = auth.user.providerUserId ?? null;
    let employee: Record<string, any> | null = null;

    if (providerUserId) {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', providerUserId)
        .is('deleted_at', null)
        .maybeSingle();
      employee = data;
    }

    return {
      id: auth.user.id,
      email: auth.user.email,
      firstName: auth.user.firstName,
      lastName: auth.user.lastName,
      role: auth.user.role,
      avatarUrl: auth.user.avatarUrl,
      phone: auth.user.phone,
      employeeRecordId: employee ? Number(employee.id) : null,
      employeeId: employee?.employee_id ?? null,
      department: employee?.department ?? null,
      designation: employee?.designation ?? null,
      dateOfJoining: employee?.date_of_joining ?? null,
      dateOfBirth: employee?.date_of_birth ?? null,
      skills: employee?.skills ?? null,
      salary: employee?.salary === null || employee?.salary === undefined ? null : Number(employee.salary),
      status: employee?.status ?? null,
    };
  } catch {
    return null;
  }
}

export async function getServerUser(): Promise<User | null> {
  return null;
}
