import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { clientCommunications, clients, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single communication by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json(
          { 
            error: 'Valid ID is required',
            code: 'INVALID_ID' 
          },
          { status: 400 }
        );
      }

      const communication = await db.select()
        .from(clientCommunications)
        .where(eq(clientCommunications.id, parseInt(id)))
        .limit(1);

      if (communication.length === 0) {
        return NextResponse.json(
          { error: 'Communication not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(communication[0], { status: 200 });
    }

    // List communications with filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const clientId = searchParams.get('clientId');
    const userId = searchParams.get('userId');
    const isRead = searchParams.get('isRead');

    let query = db.select().from(clientCommunications);

    // Build filter conditions
    const conditions = [];
    
    if (clientId) {
      if (isNaN(parseInt(clientId))) {
        return NextResponse.json(
          { 
            error: 'Valid clientId is required',
            code: 'INVALID_CLIENT_ID' 
          },
          { status: 400 }
        );
      }
      conditions.push(eq(clientCommunications.clientId, parseInt(clientId)));
    }

    if (userId) {
      if (isNaN(parseInt(userId))) {
        return NextResponse.json(
          { 
            error: 'Valid userId is required',
            code: 'INVALID_USER_ID' 
          },
          { status: 400 }
        );
      }
      conditions.push(eq(clientCommunications.userId, parseInt(userId)));
    }

    if (isRead !== null && isRead !== undefined) {
      const isReadBool = isRead === 'true';
      conditions.push(eq(clientCommunications.isRead, isReadBool));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query
      .orderBy(desc(clientCommunications.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, userId, message, attachments } = body;

    // Validation: Required fields
    if (!clientId) {
      return NextResponse.json(
        { 
          error: 'clientId is required',
          code: 'MISSING_CLIENT_ID' 
        },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { 
          error: 'userId is required',
          code: 'MISSING_USER_ID' 
        },
        { status: 400 }
      );
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { 
          error: 'message is required and cannot be empty',
          code: 'MISSING_MESSAGE' 
        },
        { status: 400 }
      );
    }

    // Validate clientId is a valid integer
    if (isNaN(parseInt(clientId))) {
      return NextResponse.json(
        { 
          error: 'clientId must be a valid integer',
          code: 'INVALID_CLIENT_ID' 
        },
        { status: 400 }
      );
    }

    // Validate userId is a valid integer
    if (isNaN(parseInt(userId))) {
      return NextResponse.json(
        { 
          error: 'userId must be a valid integer',
          code: 'INVALID_USER_ID' 
        },
        { status: 400 }
      );
    }

    // Verify client exists
    const client = await db.select()
      .from(clients)
      .where(eq(clients.id, parseInt(clientId)))
      .limit(1);

    if (client.length === 0) {
      return NextResponse.json(
        { 
          error: 'Client not found',
          code: 'CLIENT_NOT_FOUND' 
        },
        { status: 400 }
      );
    }

    // Verify user exists
    const user = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json(
        { 
          error: 'User not found',
          code: 'USER_NOT_FOUND' 
        },
        { status: 400 }
      );
    }

    // Validate attachments if provided
    if (attachments !== undefined && attachments !== null) {
      if (!Array.isArray(attachments)) {
        return NextResponse.json(
          { 
            error: 'attachments must be an array',
            code: 'INVALID_ATTACHMENTS' 
          },
          { status: 400 }
        );
      }
    }

    // Create communication
    const newCommunication = await db.insert(clientCommunications)
      .values({
        clientId: parseInt(clientId),
        userId: parseInt(userId),
        message: message.trim(),
        attachments: attachments || null,
        createdAt: new Date().toISOString(),
        isRead: false
      })
      .returning();

    return NextResponse.json(newCommunication[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        },
        { status: 400 }
      );
    }

    // Check if communication exists
    const existing = await db.select()
      .from(clientCommunications)
      .where(eq(clientCommunications.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Communication not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { message, attachments, isRead } = body;

    // Build update object
    const updates: any = {};

    if (message !== undefined) {
      if (typeof message !== 'string' || message.trim().length === 0) {
        return NextResponse.json(
          { 
            error: 'message must be a non-empty string',
            code: 'INVALID_MESSAGE' 
          },
          { status: 400 }
        );
      }
      updates.message = message.trim();
    }

    if (attachments !== undefined) {
      if (attachments !== null && !Array.isArray(attachments)) {
        return NextResponse.json(
          { 
            error: 'attachments must be an array or null',
            code: 'INVALID_ATTACHMENTS' 
          },
          { status: 400 }
        );
      }
      updates.attachments = attachments;
    }

    if (isRead !== undefined) {
      if (typeof isRead !== 'boolean') {
        return NextResponse.json(
          { 
            error: 'isRead must be a boolean',
            code: 'INVALID_IS_READ' 
          },
          { status: 400 }
        );
      }
      updates.isRead = isRead;
    }

    // Perform update
    const updated = await db.update(clientCommunications)
      .set(updates)
      .where(eq(clientCommunications.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        },
        { status: 400 }
      );
    }

    // Check if communication exists
    const existing = await db.select()
      .from(clientCommunications)
      .where(eq(clientCommunications.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Communication not found' },
        { status: 404 }
      );
    }

    // Delete communication
    const deleted = await db.delete(clientCommunications)
      .where(eq(clientCommunications.id, parseInt(id)))
      .returning();

    return NextResponse.json(
      {
        message: 'Communication deleted successfully',
        communication: deleted[0]
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}