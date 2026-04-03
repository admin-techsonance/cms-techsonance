import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { employees, users } from '@/db/schema';
import { eq, like, and, or, desc, asc, sql } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

const VALID_STATUSES = ['active', 'on_leave', 'resigned'] as const;

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

function isValidStatus(status: string): status is typeof VALID_STATUSES[number] {
  return VALID_STATUSES.includes(status as any);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const employee = await db.select()
        .from(employees)
        .where(eq(employees.id, parseInt(id)))
        .limit(1);

      if (employee.length === 0) {
        return NextResponse.json({ 
          error: 'Employee not found',
          code: 'EMPLOYEE_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(employee[0], { status: 200 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const department = searchParams.get('department');
    const status = searchParams.get('status');
    const skill = searchParams.get('skill');
    const sortField = searchParams.get('sort') ?? 'createdAt';
    const sortOrder = searchParams.get('order') ?? 'desc';

    let query = db.select().from(employees);
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(employees.employeeId, `%${search}%`),
          like(employees.department, `%${search}%`),
          like(employees.designation, `%${search}%`)
        )
      );
    }

    if (userId) {
      const userIdNum = parseInt(userId);
      if (!isNaN(userIdNum)) {
        conditions.push(eq(employees.userId, userIdNum));
      }
    }

    if (department) {
      conditions.push(like(employees.department, `%${department}%`));
    }

    if (status) {
      if (isValidStatus(status)) {
        conditions.push(eq(employees.status, status));
      }
    }

    if (skill) {
      conditions.push(
        sql`json_each(${employees.skills}) AND json_each.value LIKE ${`%${skill}%`}`
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const orderByField = sortField === 'department' ? employees.department :
                        sortField === 'designation' ? employees.designation :
                        sortField === 'dateOfJoining' ? employees.dateOfJoining :
                        sortField === 'status' ? employees.status :
                        employees.createdAt;

    query = sortOrder === 'asc' 
      ? query.orderBy(asc(orderByField))
      : query.orderBy(desc(orderByField));

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
    const body = await request.json();
    const { 
      userId, 
      employeeId, 
      department, 
      designation, 
      dateOfJoining,
      dateOfBirth,
      skills,
      salary,
      status
    } = body;

    if (!userId) {
      return NextResponse.json({ 
        error: "userId is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!employeeId || typeof employeeId !== 'string' || employeeId.trim() === '') {
      return NextResponse.json({ 
        error: "employeeId is required and must be a non-empty string",
        code: "MISSING_EMPLOYEE_ID" 
      }, { status: 400 });
    }

    if (!department || typeof department !== 'string' || department.trim() === '') {
      return NextResponse.json({ 
        error: "department is required and must be a non-empty string",
        code: "MISSING_DEPARTMENT" 
      }, { status: 400 });
    }

    if (!designation || typeof designation !== 'string' || designation.trim() === '') {
      return NextResponse.json({ 
        error: "designation is required and must be a non-empty string",
        code: "MISSING_DESIGNATION" 
      }, { status: 400 });
    }

    if (!dateOfJoining) {
      return NextResponse.json({ 
        error: "dateOfJoining is required",
        code: "MISSING_DATE_OF_JOINING" 
      }, { status: 400 });
    }

    if (!isValidDate(dateOfJoining)) {
      return NextResponse.json({ 
        error: "dateOfJoining must be a valid date",
        code: "INVALID_DATE_OF_JOINING" 
      }, { status: 400 });
    }

    if (dateOfBirth && !isValidDate(dateOfBirth)) {
      return NextResponse.json({ 
        error: "dateOfBirth must be a valid date",
        code: "INVALID_DATE_OF_BIRTH" 
      }, { status: 400 });
    }

    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json({ 
        error: "userId must be a valid number",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, userIdNum))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User with provided userId does not exist",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    const existingEmployee = await db.select()
      .from(employees)
      .where(eq(employees.employeeId, employeeId.trim()))
      .limit(1);

    if (existingEmployee.length > 0) {
      return NextResponse.json({ 
        error: "Employee with this employeeId already exists",
        code: "DUPLICATE_EMPLOYEE_ID" 
      }, { status: 400 });
    }

    if (status && !isValidStatus(status)) {
      return NextResponse.json({ 
        error: "status must be one of: active, on_leave, resigned",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    if (skills && !Array.isArray(skills)) {
      return NextResponse.json({ 
        error: "skills must be an array",
        code: "INVALID_SKILLS_FORMAT" 
      }, { status: 400 });
    }

    if (salary !== undefined && (typeof salary !== 'number' || salary < 0)) {
      return NextResponse.json({ 
        error: "salary must be a positive number",
        code: "INVALID_SALARY" 
      }, { status: 400 });
    }

    const now = new Date().toISOString();

    const insertData: any = {
      userId: userIdNum,
      employeeId: employeeId.trim(),
      department: department.trim(),
      designation: designation.trim(),
      dateOfJoining,
      status: status || 'active',
      createdAt: now,
      updatedAt: now
    };

    if (dateOfBirth) {
      insertData.dateOfBirth = dateOfBirth;
    }

    if (skills) {
      insertData.skills = JSON.stringify(skills);
    }

    if (salary !== undefined) {
      insertData.salary = salary;
    }

    const newEmployee = await db.insert(employees)
      .values(insertData)
      .returning();

    return NextResponse.json(newEmployee[0], { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
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

    const body = await request.json();

    const existing = await db.select()
      .from(employees)
      .where(eq(employees.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND' 
      }, { status: 404 });
    }

    if ('userId' in body) {
      return NextResponse.json({ 
        error: "userId cannot be updated",
        code: "USER_ID_UPDATE_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (body.employeeId !== undefined) {
      if (typeof body.employeeId !== 'string' || body.employeeId.trim() === '') {
        return NextResponse.json({ 
          error: "employeeId must be a non-empty string",
          code: "INVALID_EMPLOYEE_ID" 
        }, { status: 400 });
      }

      if (body.employeeId.trim() !== existing[0].employeeId) {
        const duplicateCheck = await db.select()
          .from(employees)
          .where(eq(employees.employeeId, body.employeeId.trim()))
          .limit(1);

        if (duplicateCheck.length > 0) {
          return NextResponse.json({ 
            error: "Employee with this employeeId already exists",
            code: "DUPLICATE_EMPLOYEE_ID" 
          }, { status: 400 });
        }
      }

      updates.employeeId = body.employeeId.trim();
    }

    if (body.department !== undefined) {
      if (typeof body.department !== 'string' || body.department.trim() === '') {
        return NextResponse.json({ 
          error: "department must be a non-empty string",
          code: "INVALID_DEPARTMENT" 
        }, { status: 400 });
      }
      updates.department = body.department.trim();
    }

    if (body.designation !== undefined) {
      if (typeof body.designation !== 'string' || body.designation.trim() === '') {
        return NextResponse.json({ 
          error: "designation must be a non-empty string",
          code: "INVALID_DESIGNATION" 
        }, { status: 400 });
      }
      updates.designation = body.designation.trim();
    }

    if (body.dateOfJoining !== undefined) {
      if (!isValidDate(body.dateOfJoining)) {
        return NextResponse.json({ 
          error: "dateOfJoining must be a valid date",
          code: "INVALID_DATE_OF_JOINING" 
        }, { status: 400 });
      }
      updates.dateOfJoining = body.dateOfJoining;
    }

    if (body.dateOfBirth !== undefined) {
      if (body.dateOfBirth !== null && !isValidDate(body.dateOfBirth)) {
        return NextResponse.json({ 
          error: "dateOfBirth must be a valid date or null",
          code: "INVALID_DATE_OF_BIRTH" 
        }, { status: 400 });
      }
      updates.dateOfBirth = body.dateOfBirth;
    }

    if (body.status !== undefined) {
      if (!isValidStatus(body.status)) {
        return NextResponse.json({ 
          error: "status must be one of: active, on_leave, resigned",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.skills !== undefined) {
      if (body.skills !== null && !Array.isArray(body.skills)) {
        return NextResponse.json({ 
          error: "skills must be an array or null",
          code: "INVALID_SKILLS_FORMAT" 
        }, { status: 400 });
      }
      updates.skills = body.skills ? JSON.stringify(body.skills) : null;
    }

    if (body.salary !== undefined) {
      if (body.salary !== null && (typeof body.salary !== 'number' || body.salary < 0)) {
        return NextResponse.json({ 
          error: "salary must be a positive number or null",
          code: "INVALID_SALARY" 
        }, { status: 400 });
      }
      updates.salary = body.salary;
    }

    const updated = await db.update(employees)
      .set(updates)
      .where(eq(employees.id, parseInt(id)))
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
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const existing = await db.select()
      .from(employees)
      .where(eq(employees.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.update(employees)
      .set({
        status: 'resigned',
        updatedAt: new Date().toISOString()
      })
      .where(eq(employees.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Employee status updated to resigned successfully',
      employee: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}