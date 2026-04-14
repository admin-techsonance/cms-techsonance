import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateEnrollmentSchema } from '@/server/validation/devices';
import { buildLegacyUserIdMap, getAdminRouteSupabase } from '@/server/supabase/route-helpers';

function normalizeSupabaseEnrollmentRow(row: Record<string, unknown>, enrolledByMap: Map<string, number | null>) {
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
  };
}

function parseEnrollmentId(id: string) {
  const enrollmentId = Number(id);
  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
    throw new BadRequestError('Valid enrollment id is required');
  }
  return enrollmentId;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const enrollmentId = parseEnrollmentId(id);
    const payload = updateEnrollmentSchema.parse(await request.json());

    const accessToken = auth?.accessToken;
    const tenantId = auth?.user.tenantId;
    if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
    const supabase = getAdminRouteSupabase();
    const { data: existing } = await supabase
      .from('nfc_tags')
      .select('*')
      .eq('id', enrollmentId)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) throw new NotFoundError('Enrollment not found');
    const { data: updated, error } = await supabase.from('nfc_tags').update({
      status: payload.status,
    })
    .eq('id', enrollmentId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    if (error || !updated) throw error ?? new Error('Failed to update enrollment');
    const enrolledByMap = await buildLegacyUserIdMap(accessToken, [String(updated.enrolled_by)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseEnrollmentRow(updated, enrolledByMap), 'Enrollment updated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const enrollmentId = parseEnrollmentId(id);

    const accessToken = auth?.accessToken;
    const tenantId = auth?.user.tenantId;
    if (!accessToken || !tenantId) throw new BadRequestError('Authorization and tenant info required');
    const supabase = getAdminRouteSupabase();
    const { data: existing } = await supabase
      .from('nfc_tags')
      .select('*')
      .eq('id', enrollmentId)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) throw new NotFoundError('Enrollment not found');
    const { data: updated, error } = await supabase.from('nfc_tags').update({
      status: 'inactive',
    })
    .eq('id', enrollmentId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
    if (error || !updated) throw error ?? new Error('Failed to deactivate enrollment');
    const enrolledByMap = await buildLegacyUserIdMap(accessToken, [String(updated.enrolled_by)].filter(Boolean), tenantId);
    return apiSuccess(normalizeSupabaseEnrollmentRow(updated, enrolledByMap), 'Enrollment deactivated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
