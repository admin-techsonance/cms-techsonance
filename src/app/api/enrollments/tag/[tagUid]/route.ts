import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { employees, nfcTags, users } from '@/db/schema';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ tagUid: string }> }) {
  try {
    await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { tagUid } = await params;
    if (!tagUid?.trim()) {
      throw new BadRequestError('Tag UID is required');
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
