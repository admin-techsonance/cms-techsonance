import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { nfcTags } from '@/db/schema';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateEnrollmentSchema } from '@/server/validation/devices';

function parseEnrollmentId(id: string) {
  const enrollmentId = Number(id);
  if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) {
    throw new BadRequestError('Valid enrollment id is required');
  }
  return enrollmentId;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const enrollmentId = parseEnrollmentId(id);
    const payload = updateEnrollmentSchema.parse(await request.json());

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
    await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const enrollmentId = parseEnrollmentId(id);

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
