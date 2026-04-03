import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { activityLogs, users } from '@/db/schema';
import { eq, like, and, or, desc, gte, lte } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single record fetch
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const record = await db.select()
        .from(activityLogs)
        .where(eq(activityLogs.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Activity log not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with pagination, filtering, and search
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');
    const module = searchParams.get('module');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(activityLogs);

    // Build filter conditions
    const conditions = [];

    // Filter by userId
    if (userId) {
      if (isNaN(parseInt(userId))) {
        return NextResponse.json({ 
          error: "Valid userId is required for filtering",
          code: "INVALID_USER_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(activityLogs.userId, parseInt(userId)));
    }

    // Filter by action
    if (action) {
      conditions.push(eq(activityLogs.action, action));
    }

    // Filter by module
    if (module) {
      conditions.push(eq(activityLogs.module, module));
    }

    // Filter by date range
    if (startDate) {
      conditions.push(gte(activityLogs.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(activityLogs.createdAt, endDate));
    }

    // Search across action and module fields
    if (search) {
      const searchCondition = or(
        like(activityLogs.action, `%${search}%`),
        like(activityLogs.module, `%${search}%`)
      );
      conditions.push(searchCondition);
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    if (sort === 'createdAt') {
      query = order === 'asc' 
        ? query.orderBy(activityLogs.createdAt)
        : query.orderBy(desc(activityLogs.createdAt));
    } else if (sort === 'action') {
      query = order === 'asc'
        ? query.orderBy(activityLogs.action)
        : query.orderBy(desc(activityLogs.action));
    } else if (sort === 'module') {
      query = order === 'asc'
        ? query.orderBy(activityLogs.module)
        : query.orderBy(desc(activityLogs.module));
    } else {
      // Default to createdAt DESC
      query = query.orderBy(desc(activityLogs.createdAt));
    }

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
    const { userId, action, module, details, ipAddress } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ 
        error: "userId is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!action || typeof action !== 'string' || action.trim() === '') {
      return NextResponse.json({ 
        error: "action is required and must be a non-empty string",
        code: "INVALID_ACTION" 
      }, { status: 400 });
    }

    if (!module || typeof module !== 'string' || module.trim() === '') {
      return NextResponse.json({ 
        error: "module is required and must be a non-empty string",
        code: "INVALID_MODULE" 
      }, { status: 400 });
    }

    // Validate userId is a valid integer
    if (isNaN(parseInt(userId))) {
      return NextResponse.json({ 
        error: "userId must be a valid integer",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    // Check if user exists
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User with specified userId does not exist",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate details is valid JSON if provided
    if (details !== undefined && details !== null) {
      if (typeof details !== 'object') {
        return NextResponse.json({ 
          error: "details must be a valid JSON object",
          code: "INVALID_DETAILS" 
        }, { status: 400 });
      }
    }

    // Validate ipAddress format if provided
    if (ipAddress !== undefined && ipAddress !== null) {
      if (typeof ipAddress !== 'string') {
        return NextResponse.json({ 
          error: "ipAddress must be a string",
          code: "INVALID_IP_ADDRESS" 
        }, { status: 400 });
      }
    }

    // Prepare insert data
    const insertData: any = {
      userId: parseInt(userId),
      action: action.trim(),
      module: module.trim(),
      createdAt: new Date().toISOString(),
    };

    if (details !== undefined && details !== null) {
      insertData.details = details;
    }

    if (ipAddress !== undefined && ipAddress !== null) {
      insertData.ipAddress = ipAddress.trim();
    }

    // Insert the new activity log
    const newLog = await db.insert(activityLogs)
      .values(insertData)
      .returning();

    return NextResponse.json(newLog[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
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

    // Check if record exists
    const existing = await db.select()
      .from(activityLogs)
      .where(eq(activityLogs.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Activity log not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete the activity log
    const deleted = await db.delete(activityLogs)
      .where(eq(activityLogs.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Activity log deleted successfully',
      deletedRecord: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}