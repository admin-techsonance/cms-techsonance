import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { employeeId: string } }
) {
  try {
    // Authentication check
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      );
    }

    // Validate employee ID parameter
    const employeeId = params.employeeId;
    if (!employeeId || isNaN(parseInt(employeeId))) {
      return NextResponse.json(
        { error: 'Valid employee ID is required', code: 'INVALID_EMPLOYEE_ID' },
        { status: 400 }
      );
    }

    const employeeIdInt = parseInt(employeeId);

    // Check if employee exists
    const employeeData = await db
      .select({
        id: employees.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: employees.department,
        status: employees.status,
        photoUrl: users.avatarUrl,
      })
      .from(employees)
      .innerJoin(users, eq(employees.userId, users.id))
      .where(eq(employees.id, employeeIdInt))
      .limit(1);

    if (employeeData.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Authorization check: employee can only view their own attendance unless admin/hr
    const isAdmin = currentUser.role === 'cms_administrator' || currentUser.role === 'hr_manager';
    const isOwnRecord = employeeData[0].email === currentUser.email;

    if (!isAdmin && !isOwnRecord) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions to view this attendance history',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const source = searchParams.get('source');

    // Validate date formats if provided
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json(
        {
          error: 'Invalid start_date format. Use YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT',
        },
        { status: 400 }
      );
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json(
        {
          error: 'Invalid end_date format. Use YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT',
        },
        { status: 400 }
      );
    }

    // ── Query 1: New attendanceRecords table ──
    let nfcRecords: any[] = [];
    if (source !== 'legacy') {
      const nfcConditions = [eq(attendanceRecords.employeeId, employeeIdInt)];
      if (startDate) nfcConditions.push(gte(attendanceRecords.date, startDate));
      if (endDate) nfcConditions.push(lte(attendanceRecords.date, endDate));

      const rawNfc = await db
        .select()
        .from(attendanceRecords)
        .where(and(...nfcConditions))
        .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.timeIn))
        .limit(limit + offset);

      nfcRecords = rawNfc.map(r => ({
        ...r,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
        _source: 'nfc'
      }));
    }

    // ── Query 2: Old attendance table ──
    let legacyRecords: any[] = [];
    if (source !== 'nfc') {
      const legacyConditions = [eq(attendance.employeeId, employeeIdInt)];
      if (startDate) legacyConditions.push(gte(attendance.date, startDate));
      if (endDate) legacyConditions.push(lte(attendance.date, endDate));

      const rawLegacy = await db
        .select()
        .from(attendance)
        .where(and(...legacyConditions))
        .orderBy(desc(attendance.date))
        .limit(limit + offset);

      legacyRecords = rawLegacy.map(r => ({
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
        metadata: r.notes ? { notes: r.notes } : null,
        createdAt: r.checkIn || r.date,
        _source: 'legacy'
      }));
    }

    // Merge and sort
    const merged = [...nfcRecords, ...legacyRecords]
      .sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.timeIn || '').localeCompare(a.timeIn || '');
      })
      .slice(offset, offset + limit);

    // Return response with employee details and attendance records
    return NextResponse.json(
      {
        employee: {
          id: employeeData[0].id,
          name: employeeData[0].firstName + ' ' + employeeData[0].lastName,
          email: employeeData[0].email,
          department: employeeData[0].department,
          photoUrl: employeeData[0].photoUrl,
          status: employeeData[0].status,
        },
        records: merged,
        pagination: {
          limit,
          offset,
          total: merged.length, // this is just the count of the current page's items in this approach
        },
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET employee attendance error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error as Error).message,
        code: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}