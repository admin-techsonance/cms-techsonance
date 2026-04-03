import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Get single session by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const session = await db.select()
        .from(sessions)
        .where(eq(sessions.id, parseInt(id)))
        .limit(1);

      if (session.length === 0) {
        return NextResponse.json({ 
          error: 'Session not found',
          code: "SESSION_NOT_FOUND" 
        }, { status: 404 });
      }

      return NextResponse.json(session[0], { status: 200 });
    }

    // List sessions with optional userId filter
    let query = db.select()
      .from(sessions)
      .orderBy(desc(sessions.createdAt));

    if (userId) {
      if (isNaN(parseInt(userId))) {
        return NextResponse.json({ 
          error: "Valid userId is required for filtering",
          code: "INVALID_USER_ID" 
        }, { status: 400 });
      }
      query = query.where(eq(sessions.userId, parseInt(userId)));
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
    const body = await request.json();
    const { userId, token, expiresAt } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ 
        error: "userId is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ 
        error: "token is required",
        code: "MISSING_TOKEN" 
      }, { status: 400 });
    }

    if (!expiresAt) {
      return NextResponse.json({ 
        error: "expiresAt is required",
        code: "MISSING_EXPIRES_AT" 
      }, { status: 400 });
    }

    // Validate userId is a valid integer
    if (isNaN(parseInt(userId.toString()))) {
      return NextResponse.json({ 
        error: "userId must be a valid integer",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    // Validate userId exists in users table
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(userId.toString())))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User with specified userId does not exist",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate token is unique
    const tokenExists = await db.select()
      .from(sessions)
      .where(eq(sessions.token, token.toString().trim()))
      .limit(1);

    if (tokenExists.length > 0) {
      return NextResponse.json({ 
        error: "Token already exists. Token must be unique.",
        code: "TOKEN_NOT_UNIQUE" 
      }, { status: 400 });
    }

    // Validate expiresAt is a valid ISO date string
    const expiresAtDate = new Date(expiresAt);
    if (isNaN(expiresAtDate.getTime())) {
      return NextResponse.json({ 
        error: "expiresAt must be a valid ISO 8601 date string",
        code: "INVALID_EXPIRES_AT_FORMAT" 
      }, { status: 400 });
    }

    // Validate expiresAt is a future date
    const now = new Date();
    if (expiresAtDate <= now) {
      return NextResponse.json({ 
        error: "expiresAt must be a future date",
        code: "EXPIRES_AT_MUST_BE_FUTURE" 
      }, { status: 400 });
    }

    // Create new session
    const newSession = await db.insert(sessions)
      .values({
        userId: parseInt(userId.toString()),
        token: token.toString().trim(),
        expiresAt: expiresAtDate.toISOString(),
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newSession[0], { status: 201 });
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

    // Check if session exists
    const existingSession = await db.select()
      .from(sessions)
      .where(eq(sessions.id, parseInt(id)))
      .limit(1);

    if (existingSession.length === 0) {
      return NextResponse.json({ 
        error: 'Session not found',
        code: "SESSION_NOT_FOUND" 
      }, { status: 404 });
    }

    const body = await request.json();
    const { userId, token, expiresAt } = body;

    // Build update object with only provided fields
    const updates: any = {};

    // Validate and add userId if provided
    if (userId !== undefined) {
      if (isNaN(parseInt(userId.toString()))) {
        return NextResponse.json({ 
          error: "userId must be a valid integer",
          code: "INVALID_USER_ID" 
        }, { status: 400 });
      }

      // Validate userId exists in users table
      const userExists = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(userId.toString())))
        .limit(1);

      if (userExists.length === 0) {
        return NextResponse.json({ 
          error: "User with specified userId does not exist",
          code: "USER_NOT_FOUND" 
        }, { status: 400 });
      }

      updates.userId = parseInt(userId.toString());
    }

    // Validate and add token if provided
    if (token !== undefined) {
      const trimmedToken = token.toString().trim();

      // Check token uniqueness (excluding current session)
      const tokenExists = await db.select()
        .from(sessions)
        .where(
          and(
            eq(sessions.token, trimmedToken),
            // Exclude current session from uniqueness check
          )
        )
        .limit(2); // Get up to 2 to check if any other exists

      const otherSessionWithToken = tokenExists.filter(s => s.id !== parseInt(id));
      if (otherSessionWithToken.length > 0) {
        return NextResponse.json({ 
          error: "Token already exists. Token must be unique.",
          code: "TOKEN_NOT_UNIQUE" 
        }, { status: 400 });
      }

      updates.token = trimmedToken;
    }

    // Validate and add expiresAt if provided
    if (expiresAt !== undefined) {
      const expiresAtDate = new Date(expiresAt);
      if (isNaN(expiresAtDate.getTime())) {
        return NextResponse.json({ 
          error: "expiresAt must be a valid ISO 8601 date string",
          code: "INVALID_EXPIRES_AT_FORMAT" 
        }, { status: 400 });
      }

      // Validate expiresAt is a future date
      const now = new Date();
      if (expiresAtDate <= now) {
        return NextResponse.json({ 
          error: "expiresAt must be a future date",
          code: "EXPIRES_AT_MUST_BE_FUTURE" 
        }, { status: 400 });
      }

      updates.expiresAt = expiresAtDate.toISOString();
    }

    // If no updates provided
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields provided for update",
        code: "NO_UPDATE_FIELDS" 
      }, { status: 400 });
    }

    // Update session
    const updatedSession = await db.update(sessions)
      .set(updates)
      .where(eq(sessions.id, parseInt(id)))
      .returning();

    return NextResponse.json(updatedSession[0], { status: 200 });
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

    // Check if session exists before deleting
    const existingSession = await db.select()
      .from(sessions)
      .where(eq(sessions.id, parseInt(id)))
      .limit(1);

    if (existingSession.length === 0) {
      return NextResponse.json({ 
        error: 'Session not found',
        code: "SESSION_NOT_FOUND" 
      }, { status: 404 });
    }

    // Delete session
    const deleted = await db.delete(sessions)
      .where(eq(sessions.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Session deleted successfully',
      session: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}