import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tickets, clients, users } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
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
    const ticketNumber = searchParams.get('ticketNumber');

    const isAdmin = hasFullAccess(user.role as UserRole);

    // Get single ticket by ID or ticketNumber
    if (id || ticketNumber) {
      let whereCondition;

      if (id) {
        if (isNaN(parseInt(id))) {
          return NextResponse.json({
            error: "Valid ID is required",
            code: "INVALID_ID"
          }, { status: 400 });
        }
        whereCondition = eq(tickets.id, parseInt(id));
      } else if (ticketNumber) {
        whereCondition = eq(tickets.ticketNumber, ticketNumber);
      }

      const ticket = await db.select()
        .from(tickets)
        .where(whereCondition)
        .limit(1);

      if (ticket.length === 0) {
        return NextResponse.json({
          error: 'Ticket not found',
          code: 'TICKET_NOT_FOUND'
        }, { status: 404 });
      }

      // Authorization: if not admin, current user must be creator or assigned (if implemented)
      if (!isAdmin) {
        if (ticket[0].createdBy !== user.id) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }

      return NextResponse.json(ticket[0]);
    }

    // List tickets with pagination, search, and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assignedTo');
    const sort = searchParams.get('sort') ?? 'createdAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(tickets);

    // Build where conditions
    const conditions = [];

    // Enforce access control for list
    if (!isAdmin) {
      conditions.push(eq(tickets.createdBy, user.id));
    }

    if (search) {
      conditions.push(
        or(
          like(tickets.ticketNumber, `%${search}%`),
          like(tickets.subject, `%${search}%`),
          like(tickets.description, `%${search}%`)
        )
      );
    }

    if (clientId) {
      const clientIdInt = parseInt(clientId);
      if (!isNaN(clientIdInt)) {
        conditions.push(eq(tickets.clientId, clientIdInt));
      }
    }

    if (status) {
      if (TICKET_STATUSES.includes(status as any)) {
        conditions.push(eq(tickets.status, status));
      }
    }

    if (priority) {
      if (TICKET_PRIORITIES.includes(priority as any)) {
        conditions.push(eq(tickets.priority, priority));
      }
    }

    if (assignedTo) {
      const assignedToInt = parseInt(assignedTo);
      if (!isNaN(assignedToInt)) {
        conditions.push(eq(tickets.assignedTo, assignedToInt));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    if (sort === 'priority') {
      // Custom priority order: urgent > high > medium > low
      const priorityOrder = { urgent: 1, high: 2, medium: 3, low: 4 };
      const results = await query.limit(limit).offset(offset);
      results.sort((a, b) => {
        const orderMultiplier = order === 'asc' ? 1 : -1;
        return (priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]) * orderMultiplier;
      });
      return NextResponse.json(results);
    } else {
      // Default sort by createdAt
      query = query.orderBy(order === 'asc' ? asc(tickets.createdAt) : desc(tickets.createdAt));
    }

    const results = await query.limit(limit).offset(offset);
    return NextResponse.json(results);

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

    // Security check: reject if userId provided in body (though we use currentUser now)
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED"
      }, { status: 400 });
    }

    const { ticketNumber, clientId, subject, description, assignedTo, priority, status } = body;

    // Validate required fields
    if (!ticketNumber || !ticketNumber.trim()) {
      return NextResponse.json({
        error: "Ticket number is required",
        code: "MISSING_TICKET_NUMBER"
      }, { status: 400 });
    }

    if (!clientId) {
      return NextResponse.json({
        error: "Client ID is required",
        code: "MISSING_CLIENT_ID"
      }, { status: 400 });
    }

    if (!subject || !subject.trim()) {
      return NextResponse.json({
        error: "Subject is required",
        code: "MISSING_SUBJECT"
      }, { status: 400 });
    }

    if (!description || !description.trim()) {
      return NextResponse.json({
        error: "Description is required",
        code: "MISSING_DESCRIPTION"
      }, { status: 400 });
    }

    // Validate clientId is a valid integer
    const clientIdInt = parseInt(clientId);
    if (isNaN(clientIdInt)) {
      return NextResponse.json({
        error: "Valid client ID is required",
        code: "INVALID_CLIENT_ID"
      }, { status: 400 });
    }

    // Validate ticketNumber is unique
    const existingTicket = await db.select()
      .from(tickets)
      .where(eq(tickets.ticketNumber, ticketNumber.trim()))
      .limit(1);

    if (existingTicket.length > 0) {
      return NextResponse.json({
        error: "Ticket number already exists",
        code: "DUPLICATE_TICKET_NUMBER"
      }, { status: 400 });
    }

    // Validate client exists
    const client = await db.select()
      .from(clients)
      .where(eq(clients.id, clientIdInt))
      .limit(1);

    if (client.length === 0) {
      return NextResponse.json({
        error: "Client not found",
        code: "CLIENT_NOT_FOUND"
      }, { status: 400 });
    }

    // Validate assignedTo if provided
    if (assignedTo !== undefined && assignedTo !== null) {
      const assignedToInt = parseInt(assignedTo);
      if (isNaN(assignedToInt)) {
        return NextResponse.json({
          error: "Valid assigned user ID is required",
          code: "INVALID_ASSIGNED_TO"
        }, { status: 400 });
      }

      const assignedUser = await db.select()
        .from(users)
        .where(eq(users.id, assignedToInt))
        .limit(1);

      if (assignedUser.length === 0) {
        return NextResponse.json({
          error: "Assigned user not found",
          code: "ASSIGNED_USER_NOT_FOUND"
        }, { status: 400 });
      }
    }

    // Validate priority if provided
    const ticketPriority = priority && isValidEnum(priority, TICKET_PRIORITIES) ? priority : 'medium';

    // Validate status if provided
    const ticketStatus = status && isValidEnum(status, TICKET_STATUSES) ? status : 'open';

    // Create ticket
    const now = new Date().toISOString();
    const newTicket = await db.insert(tickets)
      .values({
        ticketNumber: ticketNumber.trim(),
        clientId: clientIdInt,
        subject: subject.trim(),
        description: description.trim(),
        priority: ticketPriority,
        status: ticketStatus,
        assignedTo: assignedTo ? parseInt(assignedTo) : null,
        createdBy: user.id, // Set creator
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newTicket[0], { status: 201 });

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

    const ticketId = parseInt(id);

    // Check if ticket exists
    const existingTicket = await db.select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (existingTicket.length === 0) {
      return NextResponse.json({
        error: 'Ticket not found',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    const { status, priority, assignedTo } = body;
    const updates: Record<string, any> = {};

    // Validate and update status
    if (status !== undefined) {
      if (!isValidEnum(status, TICKET_STATUSES)) {
        return NextResponse.json({
          error: `Invalid status. Must be one of: ${TICKET_STATUSES.join(', ')}`,
          code: "INVALID_STATUS"
        }, { status: 400 });
      }
      updates.status = status;
    }

    // Validate and update priority
    if (priority !== undefined) {
      if (!isValidEnum(priority, TICKET_PRIORITIES)) {
        return NextResponse.json({
          error: `Invalid priority. Must be one of: ${TICKET_PRIORITIES.join(', ')}`,
          code: "INVALID_PRIORITY"
        }, { status: 400 });
      }
      updates.priority = priority;
    }

    // Validate and update assignedTo
    if (assignedTo !== undefined) {
      if (assignedTo === null) {
        updates.assignedTo = null;
      } else {
        const assignedToInt = parseInt(assignedTo);
        if (isNaN(assignedToInt)) {
          return NextResponse.json({
            error: "Valid assigned user ID is required",
            code: "INVALID_ASSIGNED_TO"
          }, { status: 400 });
        }

        const assignedUser = await db.select()
          .from(users)
          .where(eq(users.id, assignedToInt))
          .limit(1);

        if (assignedUser.length === 0) {
          return NextResponse.json({
            error: "Assigned user not found",
            code: "ASSIGNED_USER_NOT_FOUND"
          }, { status: 400 });
        }

        updates.assignedTo = assignedToInt;
      }
    }

    // Always update timestamp
    updates.updatedAt = new Date().toISOString();

    const updated = await db.update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    return NextResponse.json(updated[0]);

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

    const ticketId = parseInt(id);

    // Check if ticket exists
    const existingTicket = await db.select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (existingTicket.length === 0) {
      return NextResponse.json({
        error: 'Ticket not found',
        code: 'TICKET_NOT_FOUND'
      }, { status: 404 });
    }

    // Soft delete by setting status to 'closed'
    const deleted = await db.update(tickets)
      .set({
        status: 'closed',
        updatedAt: new Date().toISOString()
      })
      .where(eq(tickets.id, ticketId))
      .returning();

    return NextResponse.json({
      message: 'Ticket successfully closed',
      ticket: deleted[0]
    });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({
      error: safeErrorMessage(error)
    }, { status: 500 });
  }
}