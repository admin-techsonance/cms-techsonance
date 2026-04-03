import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const VALID_TYPES = ['info', 'success', 'warning', 'error'] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single notification by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const notification = await db.select()
        .from(notifications)
        .where(and(
          eq(notifications.id, parseInt(id)),
          eq(notifications.userId, user.id)
        ))
        .limit(1);

      if (notification.length === 0) {
        return NextResponse.json({ 
          error: 'Notification not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(notification[0], { status: 200 });
    }

    // List notifications with filters and pagination
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const filterUserId = searchParams.get('userId');
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    const sortOrder = searchParams.get('order') ?? 'desc';

    let query = db.select().from(notifications);

    // Build filter conditions
    const conditions = [eq(notifications.userId, user.id)];

    if (filterUserId) {
      const filterUserIdInt = parseInt(filterUserId);
      if (!isNaN(filterUserIdInt)) {
        conditions.push(eq(notifications.userId, filterUserIdInt));
      }
    }

    if (type && VALID_TYPES.includes(type as any)) {
      conditions.push(eq(notifications.type, type));
    }

    if (isRead !== null) {
      if (isRead === 'true') {
        conditions.push(eq(notifications.isRead, true));
      } else if (isRead === 'false') {
        conditions.push(eq(notifications.isRead, false));
      }
    }

    query = query.where(and(...conditions));

    // Apply sorting
    if (sortOrder === 'asc') {
      query = query.orderBy(asc(notifications.createdAt));
    } else {
      query = query.orderBy(desc(notifications.createdAt));
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

    const { userId: requestUserId, title, message, type, link } = body;

    // Validate required fields
    if (!requestUserId) {
      return NextResponse.json({ 
        error: "userId is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ 
        error: "title is required and must be a non-empty string",
        code: "INVALID_TITLE" 
      }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ 
        error: "message is required and must be a non-empty string",
        code: "INVALID_MESSAGE" 
      }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type as any)) {
      return NextResponse.json({ 
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
        code: "INVALID_TYPE" 
      }, { status: 400 });
    }

    // Validate userId exists
    const userIdInt = parseInt(requestUserId);
    if (isNaN(userIdInt)) {
      return NextResponse.json({ 
        error: "userId must be a valid integer",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, userIdInt))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User not found",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    // Create notification
    const newNotification = await db.insert(notifications)
      .values({
        userId: userIdInt,
        title: title.trim(),
        message: message.trim(),
        type,
        link: link ? link.trim() : null,
        isRead: false,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newNotification[0], { status: 201 });
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

    const body = await request.json();

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check notification exists and belongs to user
    const existing = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.id, parseInt(id)),
        eq(notifications.userId, user.id)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Notification not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    // Validate and add fields to update
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return NextResponse.json({ 
          error: "title must be a non-empty string",
          code: "INVALID_TITLE" 
        }, { status: 400 });
      }
      updates.title = body.title.trim();
    }

    if (body.message !== undefined) {
      if (typeof body.message !== 'string' || body.message.trim() === '') {
        return NextResponse.json({ 
          error: "message must be a non-empty string",
          code: "INVALID_MESSAGE" 
        }, { status: 400 });
      }
      updates.message = body.message.trim();
    }

    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type as any)) {
        return NextResponse.json({ 
          error: `type must be one of: ${VALID_TYPES.join(', ')}`,
          code: "INVALID_TYPE" 
        }, { status: 400 });
      }
      updates.type = body.type;
    }

    if (body.isRead !== undefined) {
      if (typeof body.isRead !== 'boolean') {
        return NextResponse.json({ 
          error: "isRead must be a boolean",
          code: "INVALID_IS_READ" 
        }, { status: 400 });
      }
      updates.isRead = body.isRead;
    }

    if (body.link !== undefined) {
      updates.link = body.link ? body.link.trim() : null;
    }

    const updated = await db.update(notifications)
      .set(updates)
      .where(and(
        eq(notifications.id, parseInt(id)),
        eq(notifications.userId, user.id)
      ))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Notification not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check notification exists and belongs to user
    const existing = await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.id, parseInt(id)),
        eq(notifications.userId, user.id)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Notification not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(notifications)
      .where(and(
        eq(notifications.id, parseInt(id)),
        eq(notifications.userId, user.id)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Notification not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Notification deleted successfully',
      notification: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}