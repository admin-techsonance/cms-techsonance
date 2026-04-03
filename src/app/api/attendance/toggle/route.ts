import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendanceRecords, nfcTags, employees, users } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      tagUid,
      employeeId,
      readerId,
      location,
      idempotencyKey,
      locationLatitude,
      locationLongitude,
      metadata
    } = body;

    // Validate that either tagUid or employeeId is provided
    if (!tagUid && !employeeId) {
      return NextResponse.json({
        error: 'Either tagUid or employeeId must be provided',
        code: 'MISSING_IDENTIFIER'
      }, { status: 400 });
    }

    let finalEmployeeId = employeeId;
    let checkInMethod = 'manual';
    let finalTagUid = tagUid;

    // If tagUid provided, look up employee from NFC tag
    if (tagUid) {
      const tag = await db.select()
        .from(nfcTags)
        .where(eq(nfcTags.tagUid, tagUid))
        .limit(1);

      if (tag.length === 0) {
        return NextResponse.json({
          error: 'NFC tag not found',
          code: 'TAG_NOT_FOUND'
        }, { status: 400 });
      }

      // Validate tag is active
      if (tag[0].status !== 'active') {
        return NextResponse.json({
          error: 'NFC tag is not active',
          code: 'TAG_INACTIVE'
        }, { status: 400 });
      }

      // Get employee ID from tag
      if (!tag[0].employeeId) {
        return NextResponse.json({
          error: 'NFC tag is not assigned to any employee',
          code: 'TAG_NOT_ASSIGNED'
        }, { status: 400 });
      }

      finalEmployeeId = tag[0].employeeId;
      checkInMethod = 'nfc';

      // Update tag's lastUsedAt and readerId
      await db.update(nfcTags)
        .set({
          lastUsedAt: new Date().toISOString(),
          readerId: readerId || tag[0].readerId
        })
        .where(eq(nfcTags.tagUid, tagUid));
    }

    // Validate employee exists
    const employee = await db.select({
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
      return NextResponse.json({
        error: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND'
      }, { status: 400 });
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Check if there's an active check-in for today (no timeOut)
    const activeCheckIn = await db.select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, finalEmployeeId),
          eq(attendanceRecords.date, today),
          isNull(attendanceRecords.timeOut)
        )
      )
      .limit(1);

    // SCENARIO 1: Active check-in exists → Perform TIME OUT
    if (activeCheckIn.length > 0) {
      const checkInRecord = activeCheckIn[0];
      
      // Calculate duration in minutes
      const timeInDate = new Date(checkInRecord.timeIn);
      const timeOutDate = new Date(now);
      const durationMinutes = Math.floor(
        (timeOutDate.getTime() - timeInDate.getTime()) / (1000 * 60)
      );

      // Update attendance record with check-out time and duration
      const updated = await db.update(attendanceRecords)
        .set({
          timeOut: now,
          duration: durationMinutes,
        })
        .where(eq(attendanceRecords.id, checkInRecord.id))
        .returning();

      return NextResponse.json({
        action: 'checkout',
        ...updated[0],
        employee: {
          id: employee[0].id,
          name: employee[0].name,
          email: employee[0].email,
          department: employee[0].department,
          photoUrl: employee[0].photoUrl
        },
        message: `Time Out recorded successfully. Duration: ${durationMinutes} minutes`
      }, { status: 200 });
    }

    // SCENARIO 2: No active check-in → Perform TIME IN
    
    // Idempotency check for check-in
    if (idempotencyKey) {
      const existingRecord = await db.select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingRecord.length > 0) {
        return NextResponse.json({
          action: 'checkin',
          ...existingRecord[0],
          employee: employee[0],
          message: 'Check-in already processed (idempotency)'
        }, { status: 200 });
      }
    }

    // Create new attendance record for TIME IN
    const newRecord = await db.insert(attendanceRecords)
      .values({
        employeeId: finalEmployeeId,
        date: today,
        timeIn: now,
        timeOut: null,
        locationLatitude: locationLatitude || null,
        locationLongitude: locationLongitude || null,
        duration: null,
        status: 'present',
        checkInMethod,
        readerId: readerId || null,
        location: location || null,
        tagUid: finalTagUid || null,
        idempotencyKey: idempotencyKey || null,
        syncedAt: null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: now
      })
      .returning();

    return NextResponse.json({
      action: 'checkin',
      ...newRecord[0],
      employee: {
        id: employee[0].id,
        name: employee[0].name,
        email: employee[0].email,
        department: employee[0].department,
        photoUrl: employee[0].photoUrl
      },
      message: 'Time In recorded successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('POST toggle error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}
