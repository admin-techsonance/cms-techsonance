import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leaveRequests, employees, users } from '@/db/schema';
import { eq, and, gte, lte, desc, like, or } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess } from '@/lib/permissions';

const LEAVE_TYPES = ['sick', 'casual', 'vacation', 'unpaid'] as const;
const STATUS_TYPES = ['pending', 'approved', 'rejected'] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const isAdmin = hasFullAccess(user.role);

    // Single record fetch
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({
          error: "Valid ID is required",
          code: "INVALID_ID"
        }, { status: 400 });
      }

      const leaveRequest = await db.select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, parseInt(id)))
        .limit(1);

      if (leaveRequest.length === 0) {
        return NextResponse.json({
          error: 'Leave request not found',
          code: "NOT_FOUND"
        }, { status: 404 });
      }

      // Authorization check for single record
      if (!isAdmin) {
        // Get user's employee record
        const userEmployee = await db.select()
          .from(employees)
          .where(eq(employees.userId, user.id))
          .limit(1);

        if (userEmployee.length === 0 || userEmployee[0].id !== leaveRequest[0].employeeId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }

      return NextResponse.json(leaveRequest[0], { status: 200 });
    }

    // List with filters, pagination, and sorting
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    let employeeId = searchParams.get('employeeId');
    const leaveType = searchParams.get('leaveType');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    // Build where conditions
    const conditions = [];

    // Enforce access control
    if (!isAdmin) {
      // Get user's employee record
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0) {
        // If user is not an employee, they probably shouldn't see any leave requests (unless we handle this differently)
        // Returning empty list is safe
        return NextResponse.json([], { status: 200 });
      }

      // Force filter by current user's employeeId
      employeeId = userEmployee[0].id.toString();
      conditions.push(eq(leaveRequests.employeeId, userEmployee[0].id));
    } else if (employeeId) {
      // Admin filtering by specific employee
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID"
        }, { status: 400 });
      }
      conditions.push(eq(leaveRequests.employeeId, parseInt(employeeId)));
    }

    if (leaveType) {
      if (!LEAVE_TYPES.includes(leaveType as any)) {
        return NextResponse.json({
          error: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}`,
          code: "INVALID_LEAVE_TYPE"
        }, { status: 400 });
      }
      conditions.push(eq(leaveRequests.leaveType, leaveType));
    }

    if (status) {
      if (!STATUS_TYPES.includes(status as any)) {
        return NextResponse.json({
          error: `Invalid status. Must be one of: ${STATUS_TYPES.join(', ')}`,
          code: "INVALID_STATUS"
        }, { status: 400 });
      }
      conditions.push(eq(leaveRequests.status, status));
    }

    if (startDate) {
      conditions.push(gte(leaveRequests.startDate, startDate));
    }

    if (endDate) {
      conditions.push(lte(leaveRequests.endDate, endDate));
    }

    let query = db.select().from(leaveRequests);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    if (order === 'asc') {
      query = query.orderBy(leaveRequests.createdAt);
    } else {
      query = query.orderBy(desc(leaveRequests.createdAt));
    }

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
    const body = await request.json();
    const { employeeId, leaveType, startDate, endDate, reason, approvedBy } = body;

    // Validate required fields
    if (!employeeId) {
      return NextResponse.json({
        error: "Employee ID is required",
        code: "MISSING_EMPLOYEE_ID"
      }, { status: 400 });
    }

    if (!leaveType) {
      return NextResponse.json({
        error: "Leave type is required",
        code: "MISSING_LEAVE_TYPE"
      }, { status: 400 });
    }

    if (!startDate) {
      return NextResponse.json({
        error: "Start date is required",
        code: "MISSING_START_DATE"
      }, { status: 400 });
    }

    if (!endDate) {
      return NextResponse.json({
        error: "End date is required",
        code: "MISSING_END_DATE"
      }, { status: 400 });
    }

    if (!reason || reason.trim() === '') {
      return NextResponse.json({
        error: "Reason is required",
        code: "MISSING_REASON"
      }, { status: 400 });
    }

    // Validate employee ID is a number
    if (isNaN(parseInt(employeeId))) {
      return NextResponse.json({
        error: "Valid employee ID is required",
        code: "INVALID_EMPLOYEE_ID"
      }, { status: 400 });
    }

    // Validate leave type enum
    if (!LEAVE_TYPES.includes(leaveType)) {
      return NextResponse.json({
        error: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}`,
        code: "INVALID_LEAVE_TYPE"
      }, { status: 400 });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      return NextResponse.json({
        error: "Invalid start date format",
        code: "INVALID_START_DATE"
      }, { status: 400 });
    }

    if (isNaN(end.getTime())) {
      return NextResponse.json({
        error: "Invalid end date format",
        code: "INVALID_END_DATE"
      }, { status: 400 });
    }

    if (start > end) {
      return NextResponse.json({
        error: "Start date must be before end date",
        code: "INVALID_DATE_RANGE"
      }, { status: 400 });
    }

    // Validate employeeId exists
    const employee = await db.select()
      .from(employees)
      .where(eq(employees.id, parseInt(employeeId)))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json({
        error: "Employee not found",
        code: "EMPLOYEE_NOT_FOUND"
      }, { status: 400 });
    }

    // Validate approvedBy if provided
    if (approvedBy !== undefined && approvedBy !== null) {
      if (isNaN(parseInt(approvedBy))) {
        return NextResponse.json({
          error: "Valid approver user ID is required",
          code: "INVALID_APPROVER_ID"
        }, { status: 400 });
      }

      const approver = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(approvedBy)))
        .limit(1);

      if (approver.length === 0) {
        return NextResponse.json({
          error: "Approver user not found",
          code: "APPROVER_NOT_FOUND"
        }, { status: 400 });
      }
    }

    // Create leave request
    const now = new Date().toISOString();
    const newLeaveRequest = await db.insert(leaveRequests)
      .values({
        employeeId: parseInt(employeeId),
        leaveType: leaveType,
        startDate: startDate,
        endDate: endDate,
        reason: reason.trim(),
        status: 'pending',
        approvedBy: approvedBy ? parseInt(approvedBy) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(newLeaveRequest[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error as Error).message
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({
        error: "Valid ID is required",
        code: "INVALID_ID"
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({
        error: 'Leave request not found',
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    const body = await request.json();
    const { employeeId, leaveType, startDate, endDate, reason, status, approvedBy } = body;

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Validate and update employeeId
    if (employeeId !== undefined) {
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID"
        }, { status: 400 });
      }

      const employee = await db.select()
        .from(employees)
        .where(eq(employees.id, parseInt(employeeId)))
        .limit(1);

      if (employee.length === 0) {
        return NextResponse.json({
          error: "Employee not found",
          code: "EMPLOYEE_NOT_FOUND"
        }, { status: 400 });
      }

      updates.employeeId = parseInt(employeeId);
    }

    // Validate and update leaveType
    if (leaveType !== undefined) {
      if (!LEAVE_TYPES.includes(leaveType)) {
        return NextResponse.json({
          error: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}`,
          code: "INVALID_LEAVE_TYPE"
        }, { status: 400 });
      }
      updates.leaveType = leaveType;
    }

    // Validate and update status
    if (status !== undefined) {
      if (!STATUS_TYPES.includes(status)) {
        return NextResponse.json({
          error: `Invalid status. Must be one of: ${STATUS_TYPES.join(', ')}`,
          code: "INVALID_STATUS"
        }, { status: 400 });
      }
      updates.status = status;
    }

    // Validate and update dates
    if (startDate !== undefined) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return NextResponse.json({
          error: "Invalid start date format",
          code: "INVALID_START_DATE"
        }, { status: 400 });
      }
      updates.startDate = startDate;
    }

    if (endDate !== undefined) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return NextResponse.json({
          error: "Invalid end date format",
          code: "INVALID_END_DATE"
        }, { status: 400 });
      }
      updates.endDate = endDate;
    }

    // Validate date range if both dates are being updated or one is being updated
    const finalStartDate = updates.startDate || existing[0].startDate;
    const finalEndDate = updates.endDate || existing[0].endDate;

    if (new Date(finalStartDate) > new Date(finalEndDate)) {
      return NextResponse.json({
        error: "Start date must be before end date",
        code: "INVALID_DATE_RANGE"
      }, { status: 400 });
    }

    // Update reason
    if (reason !== undefined) {
      if (reason.trim() === '') {
        return NextResponse.json({
          error: "Reason cannot be empty",
          code: "INVALID_REASON"
        }, { status: 400 });
      }
      updates.reason = reason.trim();
    }

    // Validate and update approvedBy
    if (approvedBy !== undefined) {
      if (approvedBy === null) {
        updates.approvedBy = null;
      } else {
        if (isNaN(parseInt(approvedBy))) {
          return NextResponse.json({
            error: "Valid approver user ID is required",
            code: "INVALID_APPROVER_ID"
          }, { status: 400 });
        }

        const approver = await db.select()
          .from(users)
          .where(eq(users.id, parseInt(approvedBy)))
          .limit(1);

        if (approver.length === 0) {
          return NextResponse.json({
            error: "Approver user not found",
            code: "APPROVER_NOT_FOUND"
          }, { status: 400 });
        }

        updates.approvedBy = parseInt(approvedBy);
      }
    }

    const updated = await db.update(leaveRequests)
      .set(updates)
      .where(eq(leaveRequests.id, parseInt(id)))
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({
        error: "Valid ID is required",
        code: "INVALID_ID"
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({
        error: 'Leave request not found',
        code: "NOT_FOUND"
      }, { status: 404 });
    }

    const deleted = await db.delete(leaveRequests)
      .where(eq(leaveRequests.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Leave request deleted successfully',
      data: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error as Error).message
    }, { status: 500 });
  }
}