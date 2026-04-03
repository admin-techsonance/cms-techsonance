import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { timeTracking, tasks, users } from '@/db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single time entry by ID
    if (id) {
      if (isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const entry = await db.select()
        .from(timeTracking)
        .where(and(
          eq(timeTracking.id, parseInt(id)),
          eq(timeTracking.userId, user.id)
        ))
        .limit(1);

      if (entry.length === 0) {
        return NextResponse.json({ 
          error: 'Time entry not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(entry[0]);
    }

    // List with filters, pagination, and aggregation
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const taskId = searchParams.get('taskId');
    const filterUserId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const aggregate = searchParams.get('aggregate'); // 'task' or 'user'

    // Handle aggregation queries
    if (aggregate === 'task' || aggregate === 'user') {
      const groupByField = aggregate === 'task' ? timeTracking.taskId : timeTracking.userId;
      
      let aggregateQuery = db.select({
        id: groupByField,
        totalHours: sql<number>`sum(${timeTracking.hours})`,
        entryCount: sql<number>`count(*)`,
      })
        .from(timeTracking)
        .where(eq(timeTracking.userId, user.id))
        .groupBy(groupByField);

      // Apply filters for aggregation
      const conditions = [eq(timeTracking.userId, user.id)];
      
      if (taskId) {
        conditions.push(eq(timeTracking.taskId, parseInt(taskId)));
      }
      
      if (filterUserId && parseInt(filterUserId) === user.id) {
        conditions.push(eq(timeTracking.userId, parseInt(filterUserId)));
      }
      
      if (startDate) {
        conditions.push(gte(timeTracking.date, startDate));
      }
      
      if (endDate) {
        conditions.push(lte(timeTracking.date, endDate));
      }

      if (conditions.length > 1) {
        aggregateQuery = db.select({
          id: groupByField,
          totalHours: sql<number>`sum(${timeTracking.hours})`,
          entryCount: sql<number>`count(*)`,
        })
          .from(timeTracking)
          .where(and(...conditions))
          .groupBy(groupByField);
      }

      const aggregateResults = await aggregateQuery;
      
      return NextResponse.json({
        aggregateBy: aggregate,
        results: aggregateResults
      });
    }

    // Regular list query
    let query = db.select().from(timeTracking);
    const conditions = [eq(timeTracking.userId, user.id)];

    // Apply filters
    if (taskId) {
      if (isNaN(parseInt(taskId))) {
        return NextResponse.json({ 
          error: 'Valid task ID is required',
          code: 'INVALID_TASK_ID' 
        }, { status: 400 });
      }
      conditions.push(eq(timeTracking.taskId, parseInt(taskId)));
    }

    if (filterUserId) {
      // User can only filter by their own ID
      if (parseInt(filterUserId) !== user.id) {
        return NextResponse.json({ 
          error: 'Cannot filter by other user IDs',
          code: 'UNAUTHORIZED_USER_FILTER' 
        }, { status: 403 });
      }
      conditions.push(eq(timeTracking.userId, parseInt(filterUserId)));
    }

    if (startDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}/;
      if (!dateRegex.test(startDate)) {
        return NextResponse.json({ 
          error: 'Invalid start date format. Use ISO date string',
          code: 'INVALID_START_DATE' 
        }, { status: 400 });
      }
      conditions.push(gte(timeTracking.date, startDate));
    }

    if (endDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}/;
      if (!dateRegex.test(endDate)) {
        return NextResponse.json({ 
          error: 'Invalid end date format. Use ISO date string',
          code: 'INVALID_END_DATE' 
        }, { status: 400 });
      }
      conditions.push(lte(timeTracking.date, endDate));
    }

    query = db.select()
      .from(timeTracking)
      .where(and(...conditions))
      .orderBy(desc(timeTracking.date))
      .limit(limit)
      .offset(offset);

    const results = await query;
    return NextResponse.json(results);

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
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { taskId, hours, date, description } = body;

    // Validate required fields
    if (!taskId) {
      return NextResponse.json({ 
        error: 'Task ID is required',
        code: 'MISSING_TASK_ID' 
      }, { status: 400 });
    }

    if (!hours) {
      return NextResponse.json({ 
        error: 'Hours is required',
        code: 'MISSING_HOURS' 
      }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ 
        error: 'Date is required',
        code: 'MISSING_DATE' 
      }, { status: 400 });
    }

    // Validate taskId is a valid integer
    if (isNaN(parseInt(taskId))) {
      return NextResponse.json({ 
        error: 'Task ID must be a valid integer',
        code: 'INVALID_TASK_ID' 
      }, { status: 400 });
    }

    // Validate hours is a positive integer
    const hoursInt = parseInt(hours);
    if (isNaN(hoursInt) || hoursInt <= 0) {
      return NextResponse.json({ 
        error: 'Hours must be a positive integer',
        code: 'INVALID_HOURS' 
      }, { status: 400 });
    }

    // Validate date format (ISO date string)
    const dateRegex = /^\d{4}-\d{2}-\d{2}/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ 
        error: 'Date must be a valid ISO date string (YYYY-MM-DD)',
        code: 'INVALID_DATE_FORMAT' 
      }, { status: 400 });
    }

    // Validate task exists and user has access to it
    const task = await db.select()
      .from(tasks)
      .where(eq(tasks.id, parseInt(taskId)))
      .limit(1);

    if (task.length === 0) {
      return NextResponse.json({ 
        error: 'Task not found',
        code: 'TASK_NOT_FOUND' 
      }, { status: 404 });
    }

    // Check if user is assigned to the task
    if (task[0].assignedTo !== user.id) {
      return NextResponse.json({ 
        error: 'You are not assigned to this task',
        code: 'UNAUTHORIZED_TASK_ACCESS' 
      }, { status: 403 });
    }

    // Create time entry
    const newEntry = await db.insert(timeTracking)
      .values({
        taskId: parseInt(taskId),
        userId: user.id,
        hours: hoursInt,
        date: date,
        description: description?.trim() || null,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newEntry[0], { status: 201 });

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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    const body = await request.json();

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if entry exists and belongs to user
    const existing = await db.select()
      .from(timeTracking)
      .where(and(
        eq(timeTracking.id, parseInt(id)),
        eq(timeTracking.userId, user.id)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Time entry not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const { hours, date, description } = body;
    const updates: any = {};

    // Validate and add hours if provided
    if (hours !== undefined) {
      const hoursInt = parseInt(hours);
      if (isNaN(hoursInt) || hoursInt <= 0) {
        return NextResponse.json({ 
          error: 'Hours must be a positive integer',
          code: 'INVALID_HOURS' 
        }, { status: 400 });
      }
      updates.hours = hoursInt;
    }

    // Validate and add date if provided
    if (date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}/;
      if (!dateRegex.test(date)) {
        return NextResponse.json({ 
          error: 'Date must be a valid ISO date string (YYYY-MM-DD)',
          code: 'INVALID_DATE_FORMAT' 
        }, { status: 400 });
      }
      updates.date = date;
    }

    // Add description if provided
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: 'No valid fields to update',
        code: 'NO_UPDATES' 
      }, { status: 400 });
    }

    const updated = await db.update(timeTracking)
      .set(updates)
      .where(and(
        eq(timeTracking.id, parseInt(id)),
        eq(timeTracking.userId, user.id)
      ))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update time entry',
        code: 'UPDATE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json(updated[0]);

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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if entry exists and belongs to user
    const existing = await db.select()
      .from(timeTracking)
      .where(and(
        eq(timeTracking.id, parseInt(id)),
        eq(timeTracking.userId, user.id)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Time entry not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(timeTracking)
      .where(and(
        eq(timeTracking.id, parseInt(id)),
        eq(timeTracking.userId, user.id)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to delete time entry',
        code: 'DELETE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Time entry deleted successfully',
      deleted: deleted[0]
    });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}