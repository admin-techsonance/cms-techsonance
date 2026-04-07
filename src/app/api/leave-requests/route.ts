import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { leaveRequests, employees, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import {
  LEAVE_TYPES,
  APPROVAL_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isValidEnum,
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

    const isAdmin = hasFullAccess(user.role as UserRole);

    // Single record fetch
    if (id) {
      if (isNaN(parseInt(id))) {
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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    let employeeId = searchParams.get('employeeId');
    const leaveType = searchParams.get('leaveType');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const order = searchParams.get('order') ?? 'desc';

    const conditions = [];

    // Enforce access control
    if (!isAdmin) {
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      employeeId = userEmployee[0].id.toString();
      conditions.push(eq(leaveRequests.employeeId, userEmployee[0].id));
    } else if (employeeId) {
      if (isNaN(parseInt(employeeId))) {
        return NextResponse.json({
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID"
        }, { status: 400 });
      }
      conditions.push(eq(leaveRequests.employeeId, parseInt(employeeId)));
    }

    if (leaveType) {
      if (!isValidEnum(leaveType, LEAVE_TYPES)) {
        return NextResponse.json({
          error: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}`,
          code: "INVALID_LEAVE_TYPE"
        }, { status: 400 });
      }
      conditions.push(eq(leaveRequests.leaveType, leaveType));
    }

    if (status) {
      if (!isValidEnum(status, APPROVAL_STATUSES)) {
        return NextResponse.json({
          error: `Invalid status. Must be one of: ${APPROVAL_STATUSES.join(', ')}`,
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

    const query = db.select().from(leaveRequests);
    
    // @ts-ignore - Drizzle dynamic query building type loss
    let dynamicQuery: any = query;

    if (conditions.length > 0) {
      dynamicQuery = dynamicQuery.where(and(...conditions));
    }

    // Apply sorting
    if (order === 'asc') {
      dynamicQuery = dynamicQuery.orderBy(leaveRequests.createdAt);
    } else {
      dynamicQuery = dynamicQuery.orderBy(desc(leaveRequests.createdAt));
    }

    const results = await dynamicQuery.limit(limit).offset(offset);

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
    const { leaveType, startDate, endDate, reason, leavePeriod, actualDays } = body;
    const isAdmin = hasFullAccess(user.role as UserRole);

    // Validate required fields
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

    // Validate leave type enum
    if (!isValidEnum(leaveType, LEAVE_TYPES)) {
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

    // Determine employee ID
    let employeeIdNum: number;

    if (isAdmin && body.employeeId) {
      // Admin can create leave request for any employee
      employeeIdNum = parseInt(body.employeeId);
      if (isNaN(employeeIdNum)) {
        return NextResponse.json({
          error: "Valid employee ID is required",
          code: "INVALID_EMPLOYEE_ID"
        }, { status: 400 });
      }
    } else {
      // Employees can only create leave requests for themselves
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
    const employee = await db.select()
      .from(employees)
      .where(eq(employees.id, employeeIdNum))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json({
        error: "Employee not found",
        code: "EMPLOYEE_NOT_FOUND"
      }, { status: 400 });
    }

    // Create leave request
    const now = new Date().toISOString();
    const newLeaveRequest = await db.insert(leaveRequests)
      .values({
        employeeId: employeeIdNum,
        leaveType: leaveType,
        startDate: startDate,
        endDate: endDate,
        reason: reason.trim(),
        status: 'pending',
        leavePeriod: leavePeriod || 'full_day',
        actualDays: actualDays || 1.0,
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(newLeaveRequest[0], { status: 201 });

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
    const isAdmin = hasFullAccess(user.role as UserRole);

    // Non-admin can only update their own pending leave requests
    if (!isAdmin) {
      const userEmployee = await db.select()
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (userEmployee.length === 0 || userEmployee[0].id !== existing[0].employeeId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Employees can only edit pending requests
      if (existing[0].status !== 'pending') {
        return NextResponse.json({
          error: 'Can only edit pending leave requests',
          code: 'CANNOT_EDIT'
        }, { status: 400 });
      }
    }

    const { leaveType, startDate, endDate, reason, status } = body;
    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Validate and update leaveType
    if (leaveType !== undefined) {
      if (!isValidEnum(leaveType, LEAVE_TYPES)) {
        return NextResponse.json({
          error: `Invalid leave type. Must be one of: ${LEAVE_TYPES.join(', ')}`,
          code: "INVALID_LEAVE_TYPE"
        }, { status: 400 });
      }
      updates.leaveType = leaveType;
    }

    // Admin status changes (approve/reject)
    if (status !== undefined) {
      if (!isValidEnum(status, APPROVAL_STATUSES)) {
        return NextResponse.json({
          error: `Invalid status. Must be one of: ${APPROVAL_STATUSES.join(', ')}`,
          code: "INVALID_STATUS"
        }, { status: 400 });
      }

      // Only admin can change status
      if (!isAdmin) {
        return NextResponse.json({
          error: 'Only admin/HR can approve or reject leave requests',
          code: 'FORBIDDEN'
        }, { status: 403 });
      }

      updates.status = status;
      if (status === 'approved' || status === 'rejected') {
        updates.approvedBy = user.id;
      }
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

    // Validate date range
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

    const updated = await db.update(leaveRequests)
      .set(updates)
      .where(eq(leaveRequests.id, parseInt(id)))
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

    // Only admin/HR can delete (reject) leave requests
    if (!hasFullAccess(user.role as UserRole)) {
      return NextResponse.json({ error: 'Only admin/HR can delete leave requests' }, { status: 403 });
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

    // Instead of deleting, reject the leave request
    const rejected = await db.update(leaveRequests)
      .set({
        status: 'rejected',
        approvedBy: user.id,
        updatedAt: new Date().toISOString()
      })
      .where(eq(leaveRequests.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Leave request rejected successfully',
      data: rejected[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({
      error: safeErrorMessage(error)
    }, { status: 500 });
  }
}