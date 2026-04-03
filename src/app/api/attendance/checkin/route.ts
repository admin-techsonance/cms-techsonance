import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendanceRecords, nfcTags, employees, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
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

    // Idempotency check
    if (idempotencyKey) {
      const existingRecord = await db.select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existingRecord.length > 0) {
        // Get employee details for existing record
        const employeeData = await db.select({
          id: employees.id,
          name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
          email: users.email,
          department: employees.department,
          photoUrl: users.avatarUrl,
        })
          .from(employees)
          .innerJoin(users, eq(employees.userId, users.id))
          .where(eq(employees.id, existingRecord[0].employeeId))
          .limit(1);

        return NextResponse.json({
          ...existingRecord[0],
          employee: employeeData[0] || null,
          message: 'Check-in already processed (idempotency)'
        }, { status: 200 });
      }
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

    // Check if already checked in today
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const existingCheckIn = await db.select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, finalEmployeeId),
          eq(attendanceRecords.date, today)
        )
      )
      .limit(1);

    // If already checked in today and no checkout, return existing record
    if (existingCheckIn.length > 0 && !existingCheckIn[0].timeOut) {
      return NextResponse.json({
        ...existingCheckIn[0],
        employee: {
          id: employee[0].id,
          name: employee[0].name,
          email: employee[0].email,
          department: employee[0].department,
          photoUrl: employee[0].photoUrl
        },
        message: 'Already checked in today'
      }, { status: 200 });
    }

    // Create new attendance record
    const now = new Date().toISOString();
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

    // Return with employee details
    return NextResponse.json({
      ...newRecord[0],
      employee: {
        id: employee[0].id,
        name: employee[0].name,
        email: employee[0].email,
        department: employee[0].department,
        photoUrl: employee[0].photoUrl
      },
      message: 'Check-in successful'
    }, { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}