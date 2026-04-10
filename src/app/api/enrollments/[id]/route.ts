import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { nfcTags } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateEnrollmentSchema } from '@/server/validation/devices';
import { buildLegacyUserIdMap, getRouteSupabase } from '@/server/supabase/route-helpers';

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

    if (isSupabaseDatabaseEnabled()) {
      const accessToken = auth?.accessToken;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: existing } = await supabase.from('nfc_tags').select('*').eq('id', enrollmentId).single();
      if (!existing) throw new NotFoundError('Enrollment not found');
      const { data: updated, error } = await supabase.from('nfc_tags').update({
        status: payload.status,
      }).eq('id', enrollmentId).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to update enrollment');
      const enrolledByMap = await buildLegacyUserIdMap(accessToken, [String(updated.enrolled_by)].filter(Boolean));
      return apiSuccess(normalizeSupabaseEnrollmentRow(updated, enrolledByMap), 'Enrollment updated successfully');
    }

    const [existing] = await db.select().from(nfcTags).where(eq(nfcTags.id, enrollmentId)).limit(1);
    if (!existing) throw new NotFoundError('Enrollment not found');

    const [updated] = await db.update(nfcTags).set({
      status: payload.status,
    }).where(eq(nfcTags.id, enrollmentId)).returning();

    return apiSuccess(updated, 'Enrollment updated successfully');
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

    if (isSupabaseDatabaseEnabled()) {
      const accessToken = auth?.accessToken;
      if (!accessToken) throw new BadRequestError('Authorization token is required');
      const supabase = getRouteSupabase(accessToken);
      const { data: existing } = await supabase.from('nfc_tags').select('*').eq('id', enrollmentId).single();
      if (!existing) throw new NotFoundError('Enrollment not found');
      const { data: updated, error } = await supabase.from('nfc_tags').update({
        status: 'inactive',
      }).eq('id', enrollmentId).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to deactivate enrollment');
      const enrolledByMap = await buildLegacyUserIdMap(accessToken, [String(updated.enrolled_by)].filter(Boolean));
      return apiSuccess(normalizeSupabaseEnrollmentRow(updated, enrolledByMap), 'Enrollment deactivated successfully');
    }

    const [existing] = await db.select().from(nfcTags).where(eq(nfcTags.id, enrollmentId)).limit(1);
    if (!existing) throw new NotFoundError('Enrollment not found');

    const [updated] = await db.update(nfcTags).set({
      status: 'inactive',
    }).where(eq(nfcTags.id, enrollmentId)).returning();

    return apiSuccess(updated, 'Enrollment deactivated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
