import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, employees } from '@/db/schema';
import { eq, and, desc, asc, gte, lte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import {
  ATTENDANCE_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isValidEnum,
  isValidDate,
  isValidTimestamp,
  safeErrorMessage,
} from '@/lib/constants';

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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const sort = searchParams.get('sort') ?? 'date';
    const order = searchParams.get('order') ?? 'desc';

    let conditions = [];

    // Non-admin users can only see their own attendance
    if (!hasFullAccess(user.role as UserRole)) {
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0) {
        return NextResponse.json([], { status: 200 });
      }
      conditions.push(eq(attendance.employeeId, userEmployee[0].id));
    } else if (employeeId) {
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({ 
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(attendance.employeeId, parseInt(employeeId)));
    }

    if (status) {
      if (!isValidEnum(status, ATTENDANCE_STATUSES)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
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
      error: safeErrorMessage(error)
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
    const isAdmin = hasFullAccess(user.role as UserRole);

    // Validate required fields
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

    // Validate date format
    if (!isValidDate(body.date)) {
      return NextResponse.json({ 
        error: "Invalid date format. Use ISO date string (YYYY-MM-DD)",
        code: "INVALID_DATE" 
      }, { status: 400 });
    }

    // Validate status enum
    if (!isValidEnum(body.status, ATTENDANCE_STATUSES)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Determine employee ID based on role
    let employeeIdNum: number;

    if (isAdmin && body.employeeId) {
      // Admin/HR can log attendance for any employee
      employeeIdNum = parseInt(body.employeeId);
      if (isNaN(employeeIdNum)) {
        return NextResponse.json({ 
          error: "Employee ID must be a valid number",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }
    } else {
      // Employees log their own attendance
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0) {
        return NextResponse.json({ 
          error: "Employee record not found for current user",
          code: "EMPLOYEE_NOT_FOUND" 
        }, { status: 404 });
      }
      employeeIdNum = userEmployee[0].id;
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

    // Check for existing attendance — upsert if found
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
      // Update existing record instead of rejecting
      const updated = await db.update(attendance)
        .set({
          status: body.status,
          checkIn: body.checkIn || existingRecord[0].checkIn,
          checkOut: body.checkOut || existingRecord[0].checkOut,
          notes: body.notes?.trim() || existingRecord[0].notes,
        })
        .where(eq(attendance.id, existingRecord[0].id))
        .returning();

      return NextResponse.json(updated[0], { status: 200 });
    }

    // Create new record
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
      error: safeErrorMessage(error)
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const isAdmin = hasFullAccess(user.role as UserRole);
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

    // Non-admin can only update their own attendance
    if (!isAdmin) {
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0 || existingRecord[0].employeeId !== userEmployee[0].id) {
        return NextResponse.json({ error: 'Unauthorized to update this record' }, { status: 403 });
      }
    }

    // Validate status if provided
    if (body.status && !isValidEnum(body.status, ATTENDANCE_STATUSES)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${ATTENDANCE_STATUSES.join(', ')}`,
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

    // Non-admin cannot change employeeId
    if (body.employeeId && !isAdmin) {
      return NextResponse.json({ 
        error: "Only admin can change the employee for an attendance record",
        code: "FORBIDDEN" 
      }, { status: 403 });
    }

    // Validate employeeId if provided (admin only)
    if (body.employeeId && isAdmin) {
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

    if (body.employeeId !== undefined && isAdmin) {
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
      error: safeErrorMessage(error)
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin/HR can delete attendance records
    if (!hasFullAccess(user.role as UserRole)) {
      return NextResponse.json({ error: 'Only admin/HR can delete attendance records' }, { status: 403 });
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
      error: safeErrorMessage(error)
    }, { status: 500 });
  }
}