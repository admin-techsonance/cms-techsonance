import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const employeeId = searchParams.get('employee_id');
    const readerId = searchParams.get('reader_id');
    const status = searchParams.get('status');
    const source = searchParams.get('source'); // 'nfc', 'legacy', or null for both

    // Validate common params
    if (startDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate)) {
        return NextResponse.json({ 
          error: 'Invalid start_date format. Expected YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT'
        }, { status: 400 });
      }
    }

    if (endDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(endDate)) {
        return NextResponse.json({ 
          error: 'Invalid end_date format. Expected YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT'
        }, { status: 400 });
      }
    }

    if (status) {
      const validStatuses = ['present', 'absent', 'late', 'half_day'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          error: 'Invalid status. Must be one of: present, absent, late, half_day',
          code: 'INVALID_STATUS'
        }, { status: 400 });
      }
    }

    let parsedEmployeeId: number | null = null;
    if (employeeId) {
      parsedEmployeeId = parseInt(employeeId);
      if (isNaN(parsedEmployeeId)) {
        return NextResponse.json({ 
          error: 'Invalid employee_id',
          code: 'INVALID_EMPLOYEE_ID'
        }, { status: 400 });
      }
    }

    // ── Query 1: New attendanceRecords table (NFC + manual entries) ──
    let nfcResults: any[] = [];
    if (source !== 'legacy') {
      const nfcConditions = [];
      if (startDate) nfcConditions.push(gte(attendanceRecords.date, startDate));
      if (endDate) nfcConditions.push(lte(attendanceRecords.date, endDate));
      if (parsedEmployeeId !== null) nfcConditions.push(eq(attendanceRecords.employeeId, parsedEmployeeId));
      if (readerId) nfcConditions.push(eq(attendanceRecords.readerId, readerId));
      if (status) nfcConditions.push(eq(attendanceRecords.status, status));

      let nfcQuery = db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          date: attendanceRecords.date,
          timeIn: attendanceRecords.timeIn,
          timeOut: attendanceRecords.timeOut,
          locationLatitude: attendanceRecords.locationLatitude,
          locationLongitude: attendanceRecords.locationLongitude,
          duration: attendanceRecords.duration,
          status: attendanceRecords.status,
          checkInMethod: attendanceRecords.checkInMethod,
          readerId: attendanceRecords.readerId,
          location: attendanceRecords.location,
          tagUid: attendanceRecords.tagUid,
          idempotencyKey: attendanceRecords.idempotencyKey,
          syncedAt: attendanceRecords.syncedAt,
          metadata: attendanceRecords.metadata,
          createdAt: attendanceRecords.createdAt,
          employee: {
            id: employees.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            department: employees.department,
            photoUrl: users.avatarUrl,
            status: employees.status
          }
        })
        .from(attendanceRecords)
        .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.timeIn))
        .limit(limit + offset); // Fetch enough for merging

      if (nfcConditions.length > 0) {
        nfcQuery = nfcQuery.where(and(...nfcConditions)) as any;
      }

      nfcResults = (await nfcQuery).map(r => ({ ...r, _source: 'nfc' }));
    }

    // ── Query 2: Old attendance table (legacy CMS entries) ──
    let legacyResults: any[] = [];
    if (source !== 'nfc' && !readerId) { // Legacy table has no readerId, skip if filtering by reader
      const legacyConditions = [];
      if (startDate) legacyConditions.push(gte(attendance.date, startDate));
      if (endDate) legacyConditions.push(lte(attendance.date, endDate));
      if (parsedEmployeeId !== null) legacyConditions.push(eq(attendance.employeeId, parsedEmployeeId));
      if (status) legacyConditions.push(eq(attendance.status, status));

      let legacyQuery = db
        .select({
          id: attendance.id,
          employeeId: attendance.employeeId,
          date: attendance.date,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          status: attendance.status,
          notes: attendance.notes,
          empId: employees.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          department: employees.department,
          photoUrl: users.avatarUrl,
          empStatus: employees.status,
        })
        .from(attendance)
        .leftJoin(employees, eq(attendance.employeeId, employees.id))
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(desc(attendance.date))
        .limit(limit + offset);

      if (legacyConditions.length > 0) {
        legacyQuery = legacyQuery.where(and(...legacyConditions)) as any;
      }

      const rawLegacy = await legacyQuery;

      // Normalize legacy records to match the new schema shape
      legacyResults = rawLegacy.map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        date: r.date,
        timeIn: r.checkIn,
        timeOut: r.checkOut,
        locationLatitude: null,
        locationLongitude: null,
        duration: (r.checkIn && r.checkOut)
          ? Math.floor((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000)
          : null,
        status: r.status,
        checkInMethod: 'legacy',
        readerId: null,
        location: null,
        tagUid: null,
        idempotencyKey: null,
        syncedAt: null,
        metadata: r.notes ? JSON.stringify({ notes: r.notes }) : null,
        createdAt: r.checkIn || r.date,
        employee: {
          id: r.empId,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          department: r.department,
          photoUrl: r.photoUrl,
          status: r.empStatus,
        },
        _source: 'legacy',
      }));
    }

    // ── Merge, sort by date descending, and paginate ──
    const merged = [...nfcResults, ...legacyResults]
      .sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.timeIn || '').localeCompare(a.timeIn || '');
      })
      .slice(offset, offset + limit);

    return NextResponse.json(merged, { status: 200 });
  } catch (error: any) {
    console.error('GET attendance error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { employeeId, date, timeIn, timeOut, duration, location, readerId, notes, status } = body;

    // Permissions check
    const isAdmin = ['admin', 'cms_administrator', 'hr_manager', 'management'].includes(user.role);
    
    if (!isAdmin) {
      // If not admin, check if the employeeId belongs to the current user
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);
        
      if (userEmployee.length === 0 || userEmployee[0].id !== parseInt(employeeId)) {
        return NextResponse.json({ 
          error: 'Insufficient permissions. You can only log your own attendance.',
          code: 'FORBIDDEN'
        }, { status: 403 });
      }
    }

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    if (!employeeId) {
      return NextResponse.json({ 
        error: 'employeeId is required',
        code: 'MISSING_EMPLOYEE_ID'
      }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ 
        error: 'date is required',
        code: 'MISSING_DATE'
      }, { status: 400 });
    }

    if (!timeIn) {
      return NextResponse.json({ 
        error: 'timeIn is required',
        code: 'MISSING_TIME_IN'
      }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ 
        error: 'status is required',
        code: 'MISSING_STATUS'
      }, { status: 400 });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ 
        error: 'Invalid date format. Expected YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT'
      }, { status: 400 });
    }

    try {
      new Date(timeIn).toISOString();
    } catch (e) {
      return NextResponse.json({ 
        error: 'Invalid timeIn format. Expected ISO timestamp',
        code: 'INVALID_TIME_IN'
      }, { status: 400 });
    }

    if (timeOut) {
      try {
        new Date(timeOut).toISOString();
      } catch (e) {
        return NextResponse.json({ 
          error: 'Invalid timeOut format. Expected ISO timestamp',
          code: 'INVALID_TIME_OUT'
        }, { status: 400 });
      }
    }

    const validStatuses = ['present', 'absent', 'late', 'half_day'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ 
        error: 'Invalid status. Must be one of: present, absent, late, half_day',
        code: 'INVALID_STATUS'
      }, { status: 400 });
    }

    if (duration !== undefined && duration !== null) {
      if (typeof duration !== 'number' || duration < 0) {
        return NextResponse.json({ 
          error: 'Duration must be a non-negative integer',
          code: 'INVALID_DURATION'
        }, { status: 400 });
      }
    }

    const employeeExists = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (employeeExists.length === 0) {
      return NextResponse.json({ 
        error: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND'
      }, { status: 400 });
    }

    const existingAttendance = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.employeeId, employeeId),
          eq(attendanceRecords.date, date)
        )
      )
      .limit(1);

    if (existingAttendance.length > 0) {
      return NextResponse.json({ 
        error: 'Attendance record already exists for this employee on this date',
        code: 'DUPLICATE_ENTRY'
      }, { status: 400 });
    }

    let calculatedDuration = duration;
    if (!calculatedDuration && timeOut) {
      const timeInMs = new Date(timeIn).getTime();
      const timeOutMs = new Date(timeOut).getTime();
      calculatedDuration = Math.floor((timeOutMs - timeInMs) / 1000 / 60);
    }

    const metadata = notes ? JSON.stringify({ notes, createdBy: user.id }) : JSON.stringify({ createdBy: user.id });

    const newAttendance = await db.insert(attendanceRecords)
      .values({
        employeeId,
        date,
        timeIn,
        timeOut: timeOut || null,
        duration: calculatedDuration || null,
        status,
        checkInMethod: 'manual',
        location: location || null,
        readerId: readerId || null,
        metadata,
        createdAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newAttendance[0], { status: 201 });
  } catch (error: any) {
    console.error('POST attendance error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error.message 
    }, { status: 500 });
  }
}