import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendanceRecords, nfcTags, employees, users } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tagUid, employeeId, readerId, location, idempotencyKey } = body;

    // Validate that at least one identifier is provided
    if (!tagUid && !employeeId) {
      return NextResponse.json(
        {
          error: 'Either tagUid or employeeId must be provided',
          code: 'MISSING_IDENTIFIER',
        },
        { status: 400 }
      );
    }

    let finalEmployeeId = employeeId;

    // If tagUid is provided, look up the employee
    if (tagUid) {
      const tag = await db
        .select()
        .from(nfcTags)
        .where(eq(nfcTags.tagUid, tagUid))
        .limit(1);

      if (tag.length === 0) {
        return NextResponse.json(
          { error: 'NFC tag not found', code: 'TAG_NOT_FOUND' },
          { status: 400 }
        );
      }

      if (tag[0].status !== 'active') {
        return NextResponse.json(
          { error: 'NFC tag is not active', code: 'TAG_INACTIVE' },
          { status: 400 }
        );
      }

      if (!tag[0].employeeId) {
        return NextResponse.json(
          { error: 'NFC tag is not assigned to an employee', code: 'TAG_NOT_ASSIGNED' },
          { status: 400 }
        );
      }

      finalEmployeeId = tag[0].employeeId;
    }

    // Validate employee exists
    const employee = await db
      .select({
        id: employees.id,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
        email: users.email,
        department: employees.department,
        photoUrl: users.avatarUrl,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(eq(employees.id, finalEmployeeId))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Find active check-in for today (timeOut is null)
    const activeCheckIn = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, finalEmployeeId),
          eq(attendanceRecords.date, today),
          isNull(attendanceRecords.timeOut)
        )
      )
      .limit(1);

    if (activeCheckIn.length === 0) {
      return NextResponse.json(
        {
          error: 'No active check-in found for today',
          code: 'NO_ACTIVE_CHECKIN',
        },
        { status: 404 }
      );
    }

    const checkInRecord = activeCheckIn[0];
    const timeOutTimestamp = new Date().toISOString();

    // Calculate duration in minutes
    const timeInDate = new Date(checkInRecord.timeIn);
    const timeOutDate = new Date(timeOutTimestamp);
    const durationMinutes = Math.floor(
      (timeOutDate.getTime() - timeInDate.getTime()) / (1000 * 60)
    );

    // Update attendance record with check-out time and duration
    const updated = await db
      .update(attendanceRecords)
      .set({
        timeOut: timeOutTimestamp,
        duration: durationMinutes,
      })
      .where(eq(attendanceRecords.id, checkInRecord.id))
      .returning();

    // Update NFC tag last used timestamp if tag was used
    if (tagUid) {
      await db
        .update(nfcTags)
        .set({
          lastUsedAt: timeOutTimestamp,
        })
        .where(eq(nfcTags.tagUid, tagUid));
    }

    // Get complete record with employee details
    const completeRecord = {
      ...updated[0],
      employee: employee[0],
    };

    return NextResponse.json(completeRecord, { status: 200 });
  } catch (error) {
    console.error('POST checkout error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error as Error).message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}