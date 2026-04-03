import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { chatMessages, users } from '@/db/schema';
import { eq, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

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

      const message = await db.select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.id, parseInt(id)),
            or(
              eq(chatMessages.senderId, user.id),
              eq(chatMessages.receiverId, user.id)
            )
          )
        )
        .limit(1);

      if (message.length === 0) {
        return NextResponse.json({ error: 'Chat message not found' }, { status: 404 });
      }

      return NextResponse.json(message[0], { status: 200 });
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const senderId = searchParams.get('senderId');
    const receiverId = searchParams.get('receiverId');
    const roomId = searchParams.get('roomId');
    const isRead = searchParams.get('isRead');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'asc';

    const conditions = [
      or(
        eq(chatMessages.senderId, user.id),
        eq(chatMessages.receiverId, user.id)
      )
    ];

    if (senderId && !isNaN(parseInt(senderId))) {
      conditions.push(eq(chatMessages.senderId, parseInt(senderId)));
    }

    if (receiverId && !isNaN(parseInt(receiverId))) {
      conditions.push(eq(chatMessages.receiverId, parseInt(receiverId)));
    }

    if (roomId) {
      conditions.push(eq(chatMessages.roomId, roomId));
    }

    if (isRead !== null && (isRead === 'true' || isRead === 'false')) {
      conditions.push(eq(chatMessages.isRead, isRead === 'true'));
    }

    let query = db.select()
      .from(chatMessages)
      .where(and(...conditions));

    // Apply sorting
    if (sort === 'createdAt') {
      query = order === 'desc' 
        ? query.orderBy(desc(chatMessages.createdAt))
        : query.orderBy(asc(chatMessages.createdAt));
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
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    // Security: Prevent user ID injection
    if ('senderId' in body || 'sender_id' in body) {
      return NextResponse.json({ 
        error: "Sender ID cannot be provided in request body",
        code: "SENDER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { message, receiverId, roomId, attachments } = body;

    // Validate required fields
    if (!message || message.trim() === '') {
      return NextResponse.json({ 
        error: "Message is required and cannot be empty",
        code: "MISSING_MESSAGE" 
      }, { status: 400 });
    }

    // Validate receiverId exists if provided
    if (receiverId !== undefined && receiverId !== null) {
      if (isNaN(parseInt(receiverId))) {
        return NextResponse.json({ 
          error: "Valid receiver ID is required",
          code: "INVALID_RECEIVER_ID" 
        }, { status: 400 });
      }

      const receiver = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(receiverId)))
        .limit(1);

      if (receiver.length === 0) {
        return NextResponse.json({ 
          error: "Receiver user not found",
          code: "RECEIVER_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    // Validate attachments is valid JSON array if provided
    if (attachments !== undefined && attachments !== null) {
      if (!Array.isArray(attachments)) {
        return NextResponse.json({ 
          error: "Attachments must be a valid JSON array",
          code: "INVALID_ATTACHMENTS" 
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();

    const insertData: any = {
      senderId: user.id,
      message: message.trim(),
      createdAt: now,
      isRead: false,
    };

    if (receiverId !== undefined && receiverId !== null) {
      insertData.receiverId = parseInt(receiverId);
    }

    if (roomId !== undefined && roomId !== null) {
      insertData.roomId = roomId;
    }

    if (attachments !== undefined && attachments !== null) {
      insertData.attachments = attachments;
    }

    const newMessage = await db.insert(chatMessages)
      .values(insertData)
      .returning();

    return NextResponse.json(newMessage[0], { status: 201 });
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
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const body = await request.json();

    // Security: Prevent user ID injection
    if ('senderId' in body || 'sender_id' in body) {
      return NextResponse.json({ 
        error: "Sender ID cannot be provided in request body",
        code: "SENDER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if message exists and belongs to user (as sender)
    const existing = await db.select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, parseInt(id)),
          or(
            eq(chatMessages.senderId, user.id),
            eq(chatMessages.receiverId, user.id)
          )
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Chat message not found' }, { status: 404 });
    }

    const { message, isRead, attachments } = body;
    const updates: any = {};

    // Only sender can edit message content
    if (message !== undefined) {
      if (existing[0].senderId !== user.id) {
        return NextResponse.json({ 
          error: "Only the sender can edit the message content",
          code: "UNAUTHORIZED_EDIT" 
        }, { status: 403 });
      }

      if (!message || message.trim() === '') {
        return NextResponse.json({ 
          error: "Message cannot be empty",
          code: "EMPTY_MESSAGE" 
        }, { status: 400 });
      }

      updates.message = message.trim();
    }

    // Only receiver can mark as read
    if (isRead !== undefined) {
      if (existing[0].receiverId !== user.id) {
        return NextResponse.json({ 
          error: "Only the receiver can mark the message as read",
          code: "UNAUTHORIZED_READ_UPDATE" 
        }, { status: 403 });
      }

      updates.isRead = Boolean(isRead);
    }

    // Only sender can update attachments
    if (attachments !== undefined) {
      if (existing[0].senderId !== user.id) {
        return NextResponse.json({ 
          error: "Only the sender can update attachments",
          code: "UNAUTHORIZED_ATTACHMENT_UPDATE" 
        }, { status: 403 });
      }

      if (attachments !== null && !Array.isArray(attachments)) {
        return NextResponse.json({ 
          error: "Attachments must be a valid JSON array",
          code: "INVALID_ATTACHMENTS" 
        }, { status: 400 });
      }

      updates.attachments = attachments;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATES" 
      }, { status: 400 });
    }

    const updated = await db.update(chatMessages)
      .set(updates)
      .where(eq(chatMessages.id, parseInt(id)))
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Check if message exists and user is the sender
    const existing = await db.select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, parseInt(id)),
          eq(chatMessages.senderId, user.id)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Chat message not found or you are not authorized to delete it',
        code: 'MESSAGE_NOT_FOUND_OR_UNAUTHORIZED'
      }, { status: 404 });
    }

    const deleted = await db.delete(chatMessages)
      .where(
        and(
          eq(chatMessages.id, parseInt(id)),
          eq(chatMessages.senderId, user.id)
        )
      )
      .returning();

    return NextResponse.json({
      message: 'Chat message deleted successfully',
      deleted: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}