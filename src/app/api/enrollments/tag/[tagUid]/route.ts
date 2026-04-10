import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { employees, nfcTags, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { buildLegacyUserIdMap, getRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

async function buildSupabaseEmployeeRecord(accessToken: string, employeeId: number | null) {
  if (!employeeId) return null;
  const supabase = getRouteSupabase(accessToken);
  const { data: employee } = await supabase.from('employees').select('id,user_id,department,status').eq('id', employeeId).single();
  if (!employee) return null;
  const profiles = await listSupabaseProfilesByAuthIds([String(employee.user_id)], accessToken);
  const profile = profiles.get(String(employee.user_id));
  return {
    id: Number(employee.id),
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    email: profile?.email ?? null,
    department: employee.department,
    status: employee.status,
    photoUrl: profile?.avatar_url ?? null,
  };
}

function normalizeSupabaseEnrollment(
  row: Record<string, unknown>,
  enrolledByMap: Map<string, number | null>,
  employee: Record<string, unknown> | null
) {
  const enrolledBy = typeof row.enrolled_by === 'string' ? enrolledByMap.get(row.enrolled_by) ?? null : null;
  return {
    id: Number(row.id),
    tagUid: row.tag_uid,
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    status: row.status,
    enrolledAt: row.enrolled_at ?? null,
    enrolledBy,
    lastUsedAt: row.last_used_at ?? null,
    readerId: row.reader_id ?? null,
    createdAt: row.created_at ?? null,
    employee,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tagUid: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { tagUid } = await params;
    if (!tagUid?.trim()) {
      throw new BadRequestError('Tag UID is required');
    }

    if (isSupabaseDatabaseEnabled()) {
      const accessToken = auth?.accessToken;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: enrollment, error } = await supabase.from('nfc_tags').select('*').eq('tag_uid', tagUid.trim()).single();
      if (error || !enrollment) throw new NotFoundError('NFC tag not found');
      const enrolledByMap = await buildLegacyUserIdMap(accessToken, [String(enrollment.enrolled_by)].filter(Boolean));
      const employee = await buildSupabaseEmployeeRecord(accessToken, enrollment.employee_id === null ? null : Number(enrollment.employee_id));
      return apiSuccess(normalizeSupabaseEnrollment(enrollment, enrolledByMap, employee), 'Enrollment fetched successfully');
    }

    const [enrollment] = await db.select({
      id: nfcTags.id,
      tagUid: nfcTags.tagUid,
      employeeId: nfcTags.employeeId,
      status: nfcTags.status,
      enrolledAt: nfcTags.enrolledAt,
      enrolledBy: nfcTags.enrolledBy,
      lastUsedAt: nfcTags.lastUsedAt,
      readerId: nfcTags.readerId,
      createdAt: nfcTags.createdAt,
      employee: {
        id: employees.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: employees.department,
        status: employees.status,
        photoUrl: users.avatarUrl,
      },
    }).from(nfcTags).leftJoin(employees, eq(nfcTags.employeeId, employees.id)).leftJoin(users, eq(employees.userId, users.id)).where(eq(nfcTags.tagUid, tagUid.trim())).limit(1);

    if (!enrollment) throw new NotFoundError('NFC tag not found');
    return apiSuccess(enrollment, 'Enrollment fetched successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
