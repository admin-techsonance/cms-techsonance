import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendanceRecords, employees, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
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

    // Only admin and hr can create manual entries
    if (user.role !== 'cms_administrator' && user.role !== 'hr_manager') {
      return NextResponse.json(
        { 
          error: 'Insufficient permissions. Only admin or hr can create manual attendance entries',
          code: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { employeeId, checkIn, checkOut, notes } = body;

    // Validation
    if (!employeeId) {
      return NextResponse.json(
        { error: 'employeeId is required', code: 'MISSING_EMPLOYEE_ID' },
        { status: 400 }
      );
    }

    if (!checkIn) {
      return NextResponse.json(
        { error: 'checkIn time is required', code: 'MISSING_CHECK_IN' },
        { status: 400 }
      );
    }

    // Validate employee exists
    const employee = await db
      .select({
        id: employees.id,
        employeeId: employees.employeeId,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
        email: users.email,
        department: employees.department,
        photoUrl: users.avatarUrl,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Parse dates
    const checkInDate = new Date(checkIn);
    const date = checkInDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check for duplicate entry
    const existingEntry = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, employeeId),
          eq(attendanceRecords.date, date)
        )
      )
      .limit(1);

    if (existingEntry.length > 0) {
      return NextResponse.json(
        { 
          error: 'Attendance record already exists for this employee on this date',
          code: 'DUPLICATE_ENTRY'
        },
        { status: 400 }
      );
    }

    // Calculate duration if checkout is provided
    let duration = null;
    let status = 'present';
    
    if (checkOut) {
      const checkOutDate = new Date(checkOut);
      const durationMinutes = Math.floor(
        (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60)
      );
      duration = durationMinutes;
      
      // Determine status based on check-in time (assuming 9:00 AM is standard time)
      const checkInHour = checkInDate.getHours();
      const checkInMinute = checkInDate.getMinutes();
      
      if (checkInHour > 9 || (checkInHour === 9 && checkInMinute > 15)) {
        status = 'late';
      }
    }

    // Create metadata
    const metadata = {
      notes: notes || '',
      createdBy: user.id,
      createdByName: user.firstName + ' ' + user.lastName,
      manualEntry: true,
      entryReason: 'Manual attendance entry by HR/Admin'
    };

    // Insert attendance record
    const newRecord = await db
      .insert(attendanceRecords)
      .values({
        employeeId,
        date,
        timeIn: checkInDate.toISOString(),
        timeOut: checkOut ? new Date(checkOut).toISOString() : null,
        duration,
        status,
        checkInMethod: 'manual',
        location: null,
        readerId: null,
        tagUid: null,
        locationLatitude: null,
        locationLongitude: null,
        idempotencyKey: null,
        syncedAt: null,
        metadata: JSON.stringify(metadata),
        createdAt: new Date().toISOString()
      })
      .returning();

    // Return with employee details
    return NextResponse.json(
      {
        ...newRecord[0],
        employee: {
          id: employee[0].id,
          employeeId: employee[0].employeeId,
          fullName: employee[0].name,
          name: employee[0].name,
          email: employee[0].email,
          department: employee[0].department,
          photoUrl: employee[0].photoUrl
        },
        message: 'Manual attendance entry created successfully'
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('POST manual attendance error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}
