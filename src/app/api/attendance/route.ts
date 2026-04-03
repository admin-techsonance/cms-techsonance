import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, employees } from '@/db/schema';
import { eq, like, and, or, desc, asc, gte, lte, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

const VALID_STATUSES = ['present', 'absent', 'half_day', 'leave'] as const;
type AttendanceStatus = typeof VALID_STATUSES[number];

function isValidStatus(status: string): status is AttendanceStatus {
  return VALID_STATUSES.includes(status as AttendanceStatus);
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidTimestamp(timestamp: string | null | undefined): boolean {
  if (!timestamp) return true;
  const date = new Date(timestamp);
  return date instanceof Date && !isNaN(date.getTime());
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const employeeId = searchParams.get('employeeId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const aggregate = searchParams.get('aggregate');
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    // Single record by ID
    if (id) {
      if (isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const record = await db.select()
        .from(attendance)
        .where(eq(attendance.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Attendance record not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // Monthly aggregation
    if (aggregate === 'monthly' && month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
        return NextResponse.json({ 
          error: "Valid month (1-12) and year are required for aggregation",
          code: "INVALID_DATE_PARAMS" 
        }, { status: 400 });
      }

      const startOfMonth = new Date(yearNum, monthNum - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(yearNum, monthNum, 0).toISOString().split('T')[0];

      let conditions = [
        gte(attendance.date, startOfMonth),
        lte(attendance.date, endOfMonth)
      ];

      if (employeeId) {
        if (isNaN(parseInt(employeeId))) {
          return NextResponse.json({ 
            error: "Valid employee ID is required",
            code: "INVALID_EMPLOYEE_ID" 
          }, { status: 400 });
        }
        conditions.push(eq(attendance.employeeId, parseInt(employeeId)));
      }

      const records = await db.select()
        .from(attendance)
        .where(and(...conditions));

      const summary = records.reduce((acc, record) => {
        acc[record.status] = (acc[record.status] || 0) + 1;
        acc.total = (acc.total || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return NextResponse.json({
        month: monthNum,
        year: yearNum,
        employeeId: employeeId ? parseInt(employeeId) : null,
        summary,
        records: records.length
      }, { status: 200 });
    }

    // List with pagination and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const sort = searchParams.get('sort') ?? 'date';
    const order = searchParams.get('order') ?? 'desc';

    let conditions = [];

    if (employeeId) {
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({ 
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(attendance.employeeId, parseInt(employeeId)));
    }

    if (status) {
      if (!isValidStatus(status)) {
        return NextResponse.json({ 
          error: "Invalid status. Must be one of: present, absent, half_day, leave",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      conditions.push(eq(attendance.status, status));
    }

    if (startDate) {
      if (!isValidDate(startDate)) {
        return NextResponse.json({ 
          error: "Invalid start date format. Use ISO date string (YYYY-MM-DD)",
          code: "INVALID_START_DATE" 
        }, { status: 400 });
      }
      conditions.push(gte(attendance.date, startDate));
    }

    if (endDate) {
      if (!isValidDate(endDate)) {
        return NextResponse.json({ 
          error: "Invalid end date format. Use ISO date string (YYYY-MM-DD)",
          code: "INVALID_END_DATE" 
        }, { status: 400 });
      }
      conditions.push(lte(attendance.date, endDate));
    }

    let query = db.select().from(attendance);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const orderColumn = sort === 'checkIn' ? attendance.checkIn :
                       sort === 'checkOut' ? attendance.checkOut :
                       sort === 'status' ? attendance.status :
                       attendance.date;

    query = query.orderBy(
      order === 'asc' ? asc(orderColumn) : desc(orderColumn)
    );

    const results = await query.limit(limit).offset(offset);

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
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

    // Validate required fields
    if (!body.employeeId) {
      return NextResponse.json({ 
        error: "Employee ID is required",
        code: "MISSING_EMPLOYEE_ID" 
      }, { status: 400 });
    }

    if (!body.date) {
      return NextResponse.json({ 
        error: "Date is required",
        code: "MISSING_DATE" 
      }, { status: 400 });
    }

    if (!body.status) {
      return NextResponse.json({ 
        error: "Status is required",
        code: "MISSING_STATUS" 
      }, { status: 400 });
    }

    // Validate employeeId is a number
    const employeeIdNum = parseInt(body.employeeId);
    if (isNaN(employeeIdNum)) {
      return NextResponse.json({ 
        error: "Employee ID must be a valid number",
        code: "INVALID_EMPLOYEE_ID" 
      }, { status: 400 });
    }

    // Validate employee exists
    const employeeExists = await db.select()
      .from(employees)
      .where(eq(employees.id, employeeIdNum))
      .limit(1);

    if (employeeExists.length === 0) {
      return NextResponse.json({ 
        error: "Employee not found",
        code: "EMPLOYEE_NOT_FOUND" 
      }, { status: 404 });
    }

    // Validate date format
    if (!isValidDate(body.date)) {
      return NextResponse.json({ 
        error: "Invalid date format. Use ISO date string (YYYY-MM-DD)",
        code: "INVALID_DATE" 
      }, { status: 400 });
    }

    // Validate status enum
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ 
        error: "Invalid status. Must be one of: present, absent, half_day, leave",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate checkIn timestamp if provided
    if (body.checkIn && !isValidTimestamp(body.checkIn)) {
      return NextResponse.json({ 
        error: "Invalid checkIn timestamp format. Use ISO timestamp",
        code: "INVALID_CHECK_IN" 
      }, { status: 400 });
    }

    // Validate checkOut timestamp if provided
    if (body.checkOut && !isValidTimestamp(body.checkOut)) {
      return NextResponse.json({ 
        error: "Invalid checkOut timestamp format. Use ISO timestamp",
        code: "INVALID_CHECK_OUT" 
      }, { status: 400 });
    }

    // Validate checkOut is after checkIn if both provided
    if (body.checkIn && body.checkOut) {
      const checkInDate = new Date(body.checkIn);
      const checkOutDate = new Date(body.checkOut);
      if (checkOutDate <= checkInDate) {
        return NextResponse.json({ 
          error: "Check-out time must be after check-in time",
          code: "INVALID_TIME_RANGE" 
        }, { status: 400 });
      }
    }

    // Check for duplicate attendance record for same employee and date
    const existingRecord = await db.select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeIdNum),
          eq(attendance.date, body.date)
        )
      )
      .limit(1);

    if (existingRecord.length > 0) {
      return NextResponse.json({ 
        error: "Attendance record already exists for this employee on this date",
        code: "DUPLICATE_RECORD" 
      }, { status: 400 });
    }

    // Prepare insert data
    const insertData = {
      employeeId: employeeIdNum,
      date: body.date,
      status: body.status,
      checkIn: body.checkIn || null,
      checkOut: body.checkOut || null,
      notes: body.notes?.trim() || null
    };

    const newRecord = await db.insert(attendance)
      .values(insertData)
      .returning();

    return NextResponse.json(newRecord[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const body = await request.json();

    // Check if record exists
    const existingRecord = await db.select()
      .from(attendance)
      .where(eq(attendance.id, parseInt(id)))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json({ 
        error: 'Attendance record not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Validate status if provided
    if (body.status && !isValidStatus(body.status)) {
      return NextResponse.json({ 
        error: "Invalid status. Must be one of: present, absent, half_day, leave",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate date if provided
    if (body.date && !isValidDate(body.date)) {
      return NextResponse.json({ 
        error: "Invalid date format. Use ISO date string (YYYY-MM-DD)",
        code: "INVALID_DATE" 
      }, { status: 400 });
    }

    // Validate checkIn if provided
    if (body.checkIn !== undefined && body.checkIn !== null && !isValidTimestamp(body.checkIn)) {
      return NextResponse.json({ 
        error: "Invalid checkIn timestamp format. Use ISO timestamp",
        code: "INVALID_CHECK_IN" 
      }, { status: 400 });
    }

    // Validate checkOut if provided
    if (body.checkOut !== undefined && body.checkOut !== null && !isValidTimestamp(body.checkOut)) {
      return NextResponse.json({ 
        error: "Invalid checkOut timestamp format. Use ISO timestamp",
        code: "INVALID_CHECK_OUT" 
      }, { status: 400 });
    }

    // Validate time range
    const checkIn = body.checkIn !== undefined ? body.checkIn : existingRecord[0].checkIn;
    const checkOut = body.checkOut !== undefined ? body.checkOut : existingRecord[0].checkOut;

    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      if (checkOutDate <= checkInDate) {
        return NextResponse.json({ 
          error: "Check-out time must be after check-in time",
          code: "INVALID_TIME_RANGE" 
        }, { status: 400 });
      }
    }

    // Validate employeeId if provided
    if (body.employeeId) {
      const employeeIdNum = parseInt(body.employeeId);
      if (isNaN(employeeIdNum)) {
        return NextResponse.json({ 
          error: "Employee ID must be a valid number",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }

      const employeeExists = await db.select()
        .from(employees)
        .where(eq(employees.id, employeeIdNum))
        .limit(1);

      if (employeeExists.length === 0) {
        return NextResponse.json({ 
          error: "Employee not found",
          code: "EMPLOYEE_NOT_FOUND" 
        }, { status: 404 });
      }
    }

    // Check for duplicate if date or employeeId is being changed
    if (body.date || body.employeeId) {
      const newEmployeeId = body.employeeId ? parseInt(body.employeeId) : existingRecord[0].employeeId;
      const newDate = body.date || existingRecord[0].date;

      const duplicateCheck = await db.select()
        .from(attendance)
        .where(
          and(
            eq(attendance.employeeId, newEmployeeId),
            eq(attendance.date, newDate)
          )
        )
        .limit(1);

      if (duplicateCheck.length > 0 && duplicateCheck[0].id !== parseInt(id)) {
        return NextResponse.json({ 
          error: "Attendance record already exists for this employee on this date",
          code: "DUPLICATE_RECORD" 
        }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (body.employeeId !== undefined) {
      updateData.employeeId = parseInt(body.employeeId);
    }
    if (body.date !== undefined) {
      updateData.date = body.date;
    }
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.checkIn !== undefined) {
      updateData.checkIn = body.checkIn;
    }
    if (body.checkOut !== undefined) {
      updateData.checkOut = body.checkOut;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes?.trim() || null;
    }

    const updated = await db.update(attendance)
      .set(updateData)
      .where(eq(attendance.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });

  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check if record exists
    const existingRecord = await db.select()
      .from(attendance)
      .where(eq(attendance.id, parseInt(id)))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json({ 
        error: 'Attendance record not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(attendance)
      .where(eq(attendance.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Attendance record deleted successfully',
      record: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}