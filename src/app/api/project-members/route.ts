import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectMembers, projects, users } from '@/db/schema';
import { eq, and, or, like, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

const VALID_ROLES = ['lead', 'developer', 'designer', 'tester'] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single record fetch by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const member = await db.select()
        .from(projectMembers)
        .where(eq(projectMembers.id, parseInt(id)))
        .limit(1);

      if (member.length === 0) {
        return NextResponse.json({ 
          error: 'Project member not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(member[0], { status: 200 });
    }

    // List with pagination and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const search = searchParams.get('search');

    let query = db.select().from(projectMembers);

    // Build filter conditions
    const conditions = [];

    if (projectId) {
      const projectIdNum = parseInt(projectId);
      if (!isNaN(projectIdNum)) {
        conditions.push(eq(projectMembers.projectId, projectIdNum));
      }
    }

    if (userId) {
      const userIdNum = parseInt(userId);
      if (!isNaN(userIdNum)) {
        conditions.push(eq(projectMembers.userId, userIdNum));
      }
    }

    if (role && VALID_ROLES.includes(role as any)) {
      conditions.push(eq(projectMembers.role, role));
    }

    if (search) {
      conditions.push(
        or(
          like(projectMembers.role, `%${search}%`)
        )
      );
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }

    const results = await query
      .orderBy(desc(projectMembers.assignedAt))
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
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, userId, role } = body;

    // Security check: reject if any user identifier fields are provided
    if ('createdBy' in body || 'created_by' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Validate required fields
    if (!projectId) {
      return NextResponse.json({ 
        error: "Project ID is required",
        code: "MISSING_PROJECT_ID" 
      }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ 
        error: "User ID is required",
        code: "MISSING_USER_ID" 
      }, { status: 400 });
    }

    if (!role) {
      return NextResponse.json({ 
        error: "Role is required",
        code: "MISSING_ROLE" 
      }, { status: 400 });
    }

    // Validate role enum
    if (!VALID_ROLES.includes(role as any)) {
      return NextResponse.json({ 
        error: `Role must be one of: ${VALID_ROLES.join(', ')}`,
        code: "INVALID_ROLE" 
      }, { status: 400 });
    }

    // Validate projectId is a valid integer
    const projectIdNum = parseInt(projectId);
    if (isNaN(projectIdNum)) {
      return NextResponse.json({ 
        error: "Project ID must be a valid number",
        code: "INVALID_PROJECT_ID" 
      }, { status: 400 });
    }

    // Validate userId is a valid integer
    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json({ 
        error: "User ID must be a valid number",
        code: "INVALID_USER_ID" 
      }, { status: 400 });
    }

    // Validate project exists
    const projectExists = await db.select()
      .from(projects)
      .where(eq(projects.id, projectIdNum))
      .limit(1);

    if (projectExists.length === 0) {
      return NextResponse.json({ 
        error: "Project not found",
        code: "PROJECT_NOT_FOUND" 
      }, { status: 400 });
    }

    // Validate user exists
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, userIdNum))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "User not found",
        code: "USER_NOT_FOUND" 
      }, { status: 400 });
    }

    // Check for duplicate assignment (same user to same project)
    const existingMember = await db.select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectIdNum),
          eq(projectMembers.userId, userIdNum)
        )
      )
      .limit(1);

    if (existingMember.length > 0) {
      return NextResponse.json({ 
        error: "User is already assigned to this project",
        code: "DUPLICATE_ASSIGNMENT" 
      }, { status: 400 });
    }

    // Create new project member
    const newMember = await db.insert(projectMembers)
      .values({
        projectId: projectIdNum,
        userId: userIdNum,
        role: role.trim(),
        assignedAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newMember[0], { status: 201 });

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

    // Security check: reject if any user identifier fields are provided
    if ('userId' in body || 'user_id' in body || 'projectId' in body || 'project_id' in body) {
      return NextResponse.json({ 
        error: "User ID or Project ID cannot be modified",
        code: "ID_MODIFICATION_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(projectMembers)
      .where(eq(projectMembers.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Project member not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const updates: any = {};

    // Update role if provided
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role as any)) {
        return NextResponse.json({ 
          error: `Role must be one of: ${VALID_ROLES.join(', ')}`,
          code: "INVALID_ROLE" 
        }, { status: 400 });
      }
      updates.role = body.role.trim();
    }

    // If no updates provided
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATES" 
      }, { status: 400 });
    }

    const updated = await db.update(projectMembers)
      .set(updates)
      .where(eq(projectMembers.id, parseInt(id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update project member',
        code: 'UPDATE_FAILED' 
      }, { status: 500 });
    }

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

    // Check if record exists
    const existing = await db.select()
      .from(projectMembers)
      .where(eq(projectMembers.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Project member not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(projectMembers)
      .where(eq(projectMembers.id, parseInt(id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to delete project member',
        code: 'DELETE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Project member removed successfully',
      data: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}