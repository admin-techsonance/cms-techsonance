import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ticketResponses, tickets, users } from '@/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single ticket response by ID
    if (id) {
      if (isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const ticketResponse = await db.select()
        .from(ticketResponses)
        .where(eq(ticketResponses.id, parseInt(id)))
        .limit(1);

      if (ticketResponse.length === 0) {
        return NextResponse.json({ 
          error: 'Ticket response not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(ticketResponse[0], { status: 200 });
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const ticketId = searchParams.get('ticketId');
    const userId = searchParams.get('userId');

    let query = db.select().from(ticketResponses);

    // Apply filters
    const filters = [];
    if (ticketId) {
      if (isNaN(parseInt(ticketId))) {
        return NextResponse.json({ 
          error: "Valid ticketId is required",
          code: "INVALID_TICKET_ID" 
        }, { status: 400 });
      }
      filters.push(eq(ticketResponses.ticketId, parseInt(ticketId)));
    }
    if (userId) {
      if (isNaN(parseInt(userId))) {
        return NextResponse.json({ 
          error: "Valid userId is required",
          code: "INVALID_USER_ID" 
        }, { status: 400 });
      }
      filters.push(eq(ticketResponses.userId, parseInt(userId)));
    }

    if (filters.length > 0) {
      query = query.where(and(...filters));
    }

    // Sort by createdAt in ascending order (chronological)
    const results = await query
      .orderBy(asc(ticketResponses.createdAt))
      .limit(limit)
      .offset(offset);

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
    const { ticketId, userId, message, attachments } = body;

    // Validate required fields
    if (!ticketId) {
      return NextResponse.json({ 
        error: "ticketId is required",
        code: "MISSING_TICKET_ID" 
      }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ 
        error: "userId is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!message || message.trim() === '') {
      return NextResponse.json({ 
        error: "message is required and cannot be empty",
        code: "MISSING_MESSAGE" 
      }, { status: 400 });
    }

    // Validate IDs are valid integers
    if (isNaN(parseInt(ticketId))) {
      return NextResponse.json({ 
        error: "Valid ticketId is required",
        code: "INVALID_TICKET_ID" 
      }, { status: 400 });
    }

    if (isNaN(parseInt(userId))) {
      return NextResponse.json({ 
        error: "Valid userId is required",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    // Validate ticketId exists
    const ticketExists = await db.select()
      .from(tickets)
      .where(eq(tickets.id, parseInt(ticketId)))
      .limit(1);

    if (ticketExists.length === 0) {
      return NextResponse.json({ 
        error: "Ticket not found",
        code: "TICKET_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate userId exists
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(userId)))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User not found",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate attachments if provided
    let validatedAttachments = null;
    if (attachments !== undefined && attachments !== null) {
      if (!Array.isArray(attachments)) {
        return NextResponse.json({ 
          error: "attachments must be a valid JSON array",
          code: "INVALID_ATTACHMENTS" 
        }, { status: 400 });
      }
      validatedAttachments = attachments;
    }

    // Create ticket response
    const newTicketResponse = await db.insert(ticketResponses)
      .values({
        ticketId: parseInt(ticketId),
        userId: parseInt(userId),
        message: message.trim(),
        attachments: validatedAttachments,
        createdAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newTicketResponse[0], { status: 201 });

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

    // Check if ticket response exists
    const existing = await db.select()
      .from(ticketResponses)
      .where(eq(ticketResponses.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Ticket response not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const body = await request.json();
    const { message, attachments } = body;

    // Build update object
    const updates: any = {};

    if (message !== undefined) {
      if (typeof message !== 'string' || message.trim() === '') {
        return NextResponse.json({ 
          error: "message cannot be empty",
          code: "INVALID_MESSAGE" 
        }, { status: 400 });
      }
      updates.message = message.trim();
    }

    if (attachments !== undefined) {
      if (attachments !== null && !Array.isArray(attachments)) {
        return NextResponse.json({ 
          error: "attachments must be a valid JSON array or null",
          code: "INVALID_ATTACHMENTS" 
        }, { status: 400 });
      }
      updates.attachments = attachments;
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATE_FIELDS" 
      }, { status: 400 });
    }

    // Update ticket response
    const updated = await db.update(ticketResponses)
      .set(updates)
      .where(eq(ticketResponses.id, parseInt(id)))
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

    // Check if ticket response exists
    const existing = await db.select()
      .from(ticketResponses)
      .where(eq(ticketResponses.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Ticket response not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete ticket response
    const deleted = await db.delete(ticketResponses)
      .where(eq(ticketResponses.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Ticket response deleted successfully',
      data: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}