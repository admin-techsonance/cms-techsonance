import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { dailyReports, users, employees } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

// Validate date format (YYYY-MM-DD)
function isValidDateFormat(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
}

// Validate availableStatus enum
function isValidStatus(status: string): boolean {
  const validStatuses = ['present', 'half_day', 'early_leave', 'on_leave'];
  return validStatuses.includes(status);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    // Single record by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      // Admin/HR can view any report, others only their own
      let conditions = [eq(dailyReports.id, parseInt(id))];
      if (user.role !== 'admin' && user.role !== 'hr') {
        conditions.push(eq(dailyReports.userId, user.id));
      }

      const record = await db.select({
        id: dailyReports.id,
        userId: dailyReports.userId,
        employeeId: employees.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        date: dailyReports.date,
        availableStatus: dailyReports.availableStatus,
        createdAt: dailyReports.createdAt,
        updatedAt: dailyReports.updatedAt,
      })
        .from(dailyReports)
        .innerJoin(users, eq(dailyReports.userId, users.id))
        .leftJoin(employees, eq(users.id, employees.userId))
        .where(and(...conditions))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Daily report not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with pagination and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const employeeId = searchParams.get('employeeId');
    const availableStatus = searchParams.get('availableStatus');

    let conditions = [];

    // Admin/HR can view all reports, others only their own
    if (user.role !== 'admin' && user.role !== 'hr') {
      conditions.push(eq(dailyReports.userId, user.id));
    }

    // Employee filter (for admin)
    if (employeeId && employeeId !== 'all') {
      conditions.push(eq(employees.id, parseInt(employeeId)));
    }

    // Status filter
    if (availableStatus && availableStatus !== 'all') {
      conditions.push(eq(dailyReports.availableStatus, availableStatus));
    }

    // Date range filters
    if (startDate) {
      if (!isValidDateFormat(startDate)) {
        return NextResponse.json({ 
          error: 'Invalid startDate format. Use YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT' 
        }, { status: 400 });
      }
      conditions.push(gte(dailyReports.date, startDate));
    }

    if (endDate) {
      if (!isValidDateFormat(endDate)) {
        return NextResponse.json({ 
          error: 'Invalid endDate format. Use YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT' 
        }, { status: 400 });
      }
      conditions.push(lte(dailyReports.date, endDate));
    }

    const results = await db.select({
      id: dailyReports.id,
      userId: dailyReports.userId,
      employeeId: employees.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      date: dailyReports.date,
      availableStatus: dailyReports.availableStatus,
      createdAt: dailyReports.createdAt,
      updatedAt: dailyReports.updatedAt,
    })
      .from(dailyReports)
      .innerJoin(users, eq(dailyReports.userId, users.id))
      .leftJoin(employees, eq(users.id, employees.userId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dailyReports.createdAt))
      .limit(limit)
      .offset(offset);

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

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: 'User ID cannot be provided in request body',
        code: 'USER_ID_NOT_ALLOWED' 
      }, { status: 400 });
    }

    const { date, availableStatus } = body;

    // Validate required fields
    if (!date) {
      return NextResponse.json({ 
        error: 'date is required',
        code: 'MISSING_REQUIRED_FIELD' 
      }, { status: 400 });
    }

    if (!availableStatus) {
      return NextResponse.json({ 
        error: 'availableStatus is required',
        code: 'MISSING_REQUIRED_FIELD' 
      }, { status: 400 });
    }

    // Validate date format
    if (!isValidDateFormat(date)) {
      return NextResponse.json({ 
        error: 'Invalid date format. Use YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT' 
      }, { status: 400 });
    }

    // Validate availableStatus enum
    if (!isValidStatus(availableStatus)) {
      return NextResponse.json({ 
        error: 'Invalid availableStatus. Must be one of: present, half_day, early_leave, on_leave',
        code: 'INVALID_STATUS' 
      }, { status: 400 });
    }

    // Check for duplicate (same user + same date)
    const existingReport = await db.select()
      .from(dailyReports)
      .where(and(
        eq(dailyReports.userId, user.id),
        eq(dailyReports.date, date)
      ))
      .limit(1);

    if (existingReport.length > 0) {
      return NextResponse.json({ 
        error: 'A daily report for this date already exists',
        code: 'DUPLICATE_REPORT' 
      }, { status: 400 });
    }

    // Create new daily report
    const now = new Date().toISOString();
    const newReport = await db.insert(dailyReports)
      .values({
        userId: user.id,
        date: date,
        availableStatus: availableStatus,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newReport[0], { status: 201 });

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

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    const body = await request.json();

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: 'User ID cannot be provided in request body',
        code: 'USER_ID_NOT_ALLOWED' 
      }, { status: 400 });
    }

    // Check if record exists and belongs to user
    const existingReport = await db.select()
      .from(dailyReports)
      .where(and(
        eq(dailyReports.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
      .limit(1);

    if (existingReport.length === 0) {
      return NextResponse.json({ 
        error: 'Daily report not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const { date, availableStatus } = body;
    const updates: any = {};

    // Validate and add date if provided
    if (date !== undefined) {
      if (!isValidDateFormat(date)) {
        return NextResponse.json({ 
          error: 'Invalid date format. Use YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT' 
        }, { status: 400 });
      }

      // Check for duplicate if date is being changed
      if (date !== existingReport[0].date) {
        const duplicateCheck = await db.select()
          .from(dailyReports)
          .where(and(
            eq(dailyReports.userId, user.id),
            eq(dailyReports.date, date)
          ))
          .limit(1);

        if (duplicateCheck.length > 0) {
          return NextResponse.json({ 
            error: 'A daily report for this date already exists',
            code: 'DUPLICATE_REPORT' 
          }, { status: 400 });
        }
      }

      updates.date = date;
    }

    // Validate and add availableStatus if provided
    if (availableStatus !== undefined) {
      if (!isValidStatus(availableStatus)) {
        return NextResponse.json({ 
          error: 'Invalid availableStatus. Must be one of: present, half_day, early_leave, on_leave',
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }
      updates.availableStatus = availableStatus;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: 'No valid fields to update',
        code: 'NO_UPDATES' 
      }, { status: 400 });
    }

    // Update the record
    updates.updatedAt = new Date().toISOString();

    const updated = await db.update(dailyReports)
      .set(updates)
      .where(and(
        eq(dailyReports.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
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

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if record exists and belongs to user
    const existingReport = await db.select()
      .from(dailyReports)
      .where(and(
        eq(dailyReports.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
      .limit(1);

    if (existingReport.length === 0) {
      return NextResponse.json({ 
        error: 'Daily report not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete the record
    const deleted = await db.delete(dailyReports)
      .where(and(
        eq(dailyReports.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
      .returning();

    return NextResponse.json({ 
      message: 'Daily report deleted successfully',
      deletedReport: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}