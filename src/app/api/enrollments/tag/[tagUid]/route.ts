import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { nfcTags, employees, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { tagUid: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      );
    }

    const { tagUid } = params;

    if (!tagUid) {
      return NextResponse.json(
        { error: 'Tag UID is required', code: 'MISSING_TAG_UID' },
        { status: 400 }
      );
    }

    const enrollment = await db
      .select({
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
      })
      .from(nfcTags)
      .leftJoin(employees, eq(nfcTags.employeeId, employees.id))
      .leftJoin(users, eq(employees.userId, users.id))
      .where(eq(nfcTags.tagUid, tagUid))
      .limit(1);

    if (enrollment.length === 0) {
      return NextResponse.json(
        { error: 'NFC tag not found', code: 'TAG_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(enrollment[0], { status: 200 });
  } catch (error) {
    console.error('GET tag enrollment error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}