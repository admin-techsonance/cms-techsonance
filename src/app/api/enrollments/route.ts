import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { nfcTags, employees, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

const VALID_STATUSES = ['active', 'inactive', 'lost', 'damaged'];

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    // Check role permissions (admin or hr only)
    if (user.role !== 'cms_administrator' && user.role !== 'hr_manager') {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Admin or HR role required.',
        code: 'FORBIDDEN' 
      }, { status: 403 });
    }

    const body = await request.json();
    const { tagUid, employeeId } = body;

    // Security check: reject if enrolledBy provided in body
    if ('enrolledBy' in body) {
      return NextResponse.json({ 
        error: "enrolledBy cannot be provided in request body",
        code: "ENROLLED_BY_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Validate required fields
    if (!tagUid || typeof tagUid !== 'string' || tagUid.trim() === '') {
      return NextResponse.json({ 
        error: 'tagUid is required and must be a non-empty string',
        code: 'INVALID_TAG_UID' 
      }, { status: 400 });
    }

    if (!employeeId || typeof employeeId !== 'number') {
      return NextResponse.json({ 
        error: 'employeeId is required and must be a valid integer',
        code: 'INVALID_EMPLOYEE_ID' 
      }, { status: 400 });
    }

    // Validate employee exists
    const employee = await db.select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json({ 
        error: 'Employee not found',
        code: 'EMPLOYEE_NOT_FOUND' 
      }, { status: 400 });
    }

    // Validate tagUid is unique (not already enrolled)
    const existingTag = await db.select()
      .from(nfcTags)
      .where(eq(nfcTags.tagUid, tagUid.trim()))
      .limit(1);

    if (existingTag.length > 0) {
      return NextResponse.json({ 
        error: 'NFC tag is already enrolled',
        code: 'TAG_ALREADY_ENROLLED' 
      }, { status: 400 });
    }

    // Create enrollment
    const now = new Date().toISOString();
    const newEnrollment = await db.insert(nfcTags)
      .values({
        tagUid: tagUid.trim(),
        employeeId: employeeId,
        status: 'active',
        enrolledAt: now,
        enrolledBy: user.id,
        createdAt: now,
      })
      .returning();

    // Fetch enrollment with employee details
    const enrollmentWithEmployee = await db.select({
      id: nfcTags.id,
      tagUid: nfcTags.tagUid,
      employeeId: nfcTags.employeeId,
      status: nfcTags.status,
      enrolledAt: nfcTags.enrolledAt,
      enrolledBy: nfcTags.enrolledBy,
      lastUsedAt: nfcTags.lastUsedAt,
      readerId: nfcTags.readerId,
      createdAt: nfcTags.createdAt,
      employee: {
        id: employees.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: employees.department,
      }
    })
      .from(nfcTags)
      .innerJoin(employees, eq(nfcTags.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .where(eq(nfcTags.id, newEnrollment[0].id))
      .limit(1);

    return NextResponse.json(enrollmentWithEmployee[0], { status: 201 });

  } catch (error) {
    console.error('POST enrollment error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    
    // Filters
    const statusFilter = searchParams.get('status');
    const employeeIdFilter = searchParams.get('employee_id');

    // Validate status if provided
    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        code: 'INVALID_STATUS' 
      }, { status: 400 });
    }

    // Validate employee_id if provided
    if (employeeIdFilter && isNaN(parseInt(employeeIdFilter))) {
      return NextResponse.json({ 
        error: 'Invalid employee_id. Must be a valid integer',
        code: 'INVALID_EMPLOYEE_ID' 
      }, { status: 400 });
    }

    const conditions = [];
    
    if (statusFilter) {
      conditions.push(eq(nfcTags.status, statusFilter));
    }
    
    if (employeeIdFilter) {
      conditions.push(eq(nfcTags.employeeId, parseInt(employeeIdFilter)));
    }

    // Apply sorting and pagination
    const results = await db.select({
      id: nfcTags.id,
      tagUid: nfcTags.tagUid,
      employeeId: nfcTags.employeeId,
      status: nfcTags.status,
      enrolledAt: nfcTags.enrolledAt,
      enrolledBy: nfcTags.enrolledBy,
      lastUsedAt: nfcTags.lastUsedAt,
      readerId: nfcTags.readerId,
      createdAt: nfcTags.createdAt,
      employee: {
        id: employees.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: employees.department,
      }
    })
      .from(nfcTags)
      .innerJoin(employees, eq(nfcTags.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(nfcTags.enrolledAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    console.error('GET enrollments error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}