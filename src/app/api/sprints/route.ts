import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sprints, projects } from '@/db/schema';
import { eq, like, and, or, desc, asc, gte, lte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const VALID_STATUSES = ['planning', 'active', 'completed', 'cancelled'] as const;
const INVALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  'completed': ['planning'],
  'cancelled': ['planning', 'active']
};

function isValidISODate(dateString: string): boolean {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDateRegex.test(dateString)) return false;
  const date = new Date(dateString);
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

    // Single sprint by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const sprint = await db.select()
        .from(sprints)
        .where(eq(sprints.id, parseInt(id)))
        .limit(1);

      if (sprint.length === 0) {
        return NextResponse.json({ 
          error: 'Sprint not found',
          code: 'SPRINT_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(sprint[0], { status: 200 });
    }

    // List with filters and pagination
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const startDateGte = searchParams.get('startDate');
    const endDateLte = searchParams.get('endDate');
    const sortField = searchParams.get('sort') ?? 'startDate';
    const sortOrder = searchParams.get('order') ?? 'desc';

    let query = db.select().from(sprints);
    const conditions = [];

    // Search filter
    if (search) {
      conditions.push(
        or(
          like(sprints.name, `%${search}%`),
          like(sprints.goal, `%${search}%`)
        )
      );
    }

    // ProjectId filter
    if (projectId && !isNaN(parseInt(projectId))) {
      conditions.push(eq(sprints.projectId, parseInt(projectId)));
    }

    // Status filter
    if (status && VALID_STATUSES.includes(status as any)) {
      conditions.push(eq(sprints.status, status));
    }

    // Date range filters
    if (startDateGte && isValidISODate(startDateGte)) {
      conditions.push(gte(sprints.startDate, startDateGte));
    }

    if (endDateLte && isValidISODate(endDateLte)) {
      conditions.push(lte(sprints.endDate, endDateLte));
    }

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    const orderFn = sortOrder === 'asc' ? asc : desc;
    const sortColumn = sortField === 'name' ? sprints.name :
                       sortField === 'status' ? sprints.status :
                       sortField === 'endDate' ? sprints.endDate :
                       sprints.startDate;
    
    query = query.orderBy(orderFn(sortColumn));

    // Apply pagination
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

    // Security check: reject if user identifier fields provided
    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { projectId, name, goal, startDate, endDate, status = 'planning' } = body;

    // Validate required fields
    if (!projectId) {
      return NextResponse.json({ 
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID' 
      }, { status: 400 });
    }

    if (isNaN(parseInt(projectId))) {
      return NextResponse.json({ 
        error: 'Project ID must be a valid integer',
        code: 'INVALID_PROJECT_ID' 
      }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Sprint name is required and must be a non-empty string',
        code: 'MISSING_NAME' 
      }, { status: 400 });
    }

    if (!startDate) {
      return NextResponse.json({ 
        error: 'Start date is required',
        code: 'MISSING_START_DATE' 
      }, { status: 400 });
    }

    if (!endDate) {
      return NextResponse.json({ 
        error: 'End date is required',
        code: 'MISSING_END_DATE' 
      }, { status: 400 });
    }

    // Validate date formats
    if (!isValidISODate(startDate)) {
      return NextResponse.json({ 
        error: 'Start date must be in YYYY-MM-DD format',
        code: 'INVALID_START_DATE_FORMAT' 
      }, { status: 400 });
    }

    if (!isValidISODate(endDate)) {
      return NextResponse.json({ 
        error: 'End date must be in YYYY-MM-DD format',
        code: 'INVALID_END_DATE_FORMAT' 
      }, { status: 400 });
    }

    // Validate end date is after start date
    if (new Date(endDate) <= new Date(startDate)) {
      return NextResponse.json({ 
        error: 'End date must be after start date',
        code: 'INVALID_DATE_RANGE' 
      }, { status: 400 });
    }

    // Validate status
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ 
        error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
        code: 'INVALID_STATUS' 
      }, { status: 400 });
    }

    // Validate project exists
    const project = await db.select()
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (project.length === 0) {
      return NextResponse.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 400 });
    }

    // Create sprint
    const now = new Date().toISOString();
    const newSprint = await db.insert(sprints)
      .values({
        projectId: parseInt(projectId),
        name: name.trim(),
        goal: goal ? goal.trim() : null,
        startDate,
        endDate,
        status,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newSprint[0], { status: 201 });

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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    const body = await request.json();

    // Security check: reject if user identifier fields provided
    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if sprint exists
    const existingSprint = await db.select()
      .from(sprints)
      .where(eq(sprints.id, parseInt(id)))
      .limit(1);

    if (existingSprint.length === 0) {
      return NextResponse.json({ 
        error: 'Sprint not found',
        code: 'SPRINT_NOT_FOUND' 
      }, { status: 404 });
    }

    const currentSprint = existingSprint[0];
    const { name, goal, startDate, endDate, status } = body;
    const updates: any = {};

    // Validate and add name
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Sprint name must be a non-empty string',
          code: 'INVALID_NAME' 
        }, { status: 400 });
      }
      updates.name = name.trim();
    }

    // Add goal
    if (goal !== undefined) {
      updates.goal = goal ? goal.trim() : null;
    }

    // Validate and add dates
    const newStartDate = startDate ?? currentSprint.startDate;
    const newEndDate = endDate ?? currentSprint.endDate;

    if (startDate !== undefined) {
      if (!isValidISODate(startDate)) {
        return NextResponse.json({ 
          error: 'Start date must be in YYYY-MM-DD format',
          code: 'INVALID_START_DATE_FORMAT' 
        }, { status: 400 });
      }
      updates.startDate = startDate;
    }

    if (endDate !== undefined) {
      if (!isValidISODate(endDate)) {
        return NextResponse.json({ 
          error: 'End date must be in YYYY-MM-DD format',
          code: 'INVALID_END_DATE_FORMAT' 
        }, { status: 400 });
      }
      updates.endDate = endDate;
    }

    // Validate date range
    if (new Date(newEndDate) <= new Date(newStartDate)) {
      return NextResponse.json({ 
        error: 'End date must be after start date',
        code: 'INVALID_DATE_RANGE' 
      }, { status: 400 });
    }

    // Validate status and status transitions
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ 
          error: `Status must be one of: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }

      // Check for invalid status transitions
      const currentStatus = currentSprint.status;
      const invalidTransitions = INVALID_STATUS_TRANSITIONS[currentStatus];
      if (invalidTransitions && invalidTransitions.includes(status)) {
        return NextResponse.json({ 
          error: `Cannot transition from ${currentStatus} to ${status}`,
          code: 'INVALID_STATUS_TRANSITION' 
        }, { status: 400 });
      }

      updates.status = status;
    }

    // Always update timestamp
    updates.updatedAt = new Date().toISOString();

    // Update sprint
    const updatedSprint = await db.update(sprints)
      .set(updates)
      .where(eq(sprints.id, parseInt(id)))
      .returning();

    return NextResponse.json(updatedSprint[0], { status: 200 });

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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if sprint exists
    const existingSprint = await db.select()
      .from(sprints)
      .where(eq(sprints.id, parseInt(id)))
      .limit(1);

    if (existingSprint.length === 0) {
      return NextResponse.json({ 
        error: 'Sprint not found',
        code: 'SPRINT_NOT_FOUND' 
      }, { status: 404 });
    }

    // Soft delete by setting status to cancelled
    const deletedSprint = await db.update(sprints)
      .set({
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      })
      .where(eq(sprints.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Sprint deleted successfully',
      sprint: deletedSprint[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}