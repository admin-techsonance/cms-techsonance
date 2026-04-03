import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { milestones, projects } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const VALID_STATUSES = ['pending', 'in_progress', 'completed'] as const;

function isValidStatus(status: string): status is typeof VALID_STATUSES[number] {
  return VALID_STATUSES.includes(status as any);
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const milestone = await db.select()
        .from(milestones)
        .where(eq(milestones.id, parseInt(id)))
        .limit(1);

      if (milestone.length === 0) {
        return NextResponse.json({ 
          error: 'Milestone not found',
          code: 'MILESTONE_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(milestone[0], { status: 200 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const sortField = searchParams.get('sort') ?? 'dueDate';
    const sortOrder = searchParams.get('order') ?? 'asc';

    let query = db.select().from(milestones);

    const conditions = [];

    if (projectId) {
      if (isNaN(parseInt(projectId))) {
        return NextResponse.json({ 
          error: "Valid project ID is required",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(milestones.projectId, parseInt(projectId)));
    }

    if (status) {
      if (!isValidStatus(status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      conditions.push(eq(milestones.status, status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (sortField === 'dueDate') {
      query = sortOrder === 'desc' 
        ? query.orderBy(desc(milestones.dueDate))
        : query.orderBy(asc(milestones.dueDate));
    } else if (sortField === 'createdAt') {
      query = sortOrder === 'desc' 
        ? query.orderBy(desc(milestones.createdAt))
        : query.orderBy(asc(milestones.createdAt));
    } else if (sortField === 'status') {
      query = sortOrder === 'desc' 
        ? query.orderBy(desc(milestones.status))
        : query.orderBy(asc(milestones.status));
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

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { projectId, title, dueDate, description, status } = body;

    if (!projectId) {
      return NextResponse.json({ 
        error: "Project ID is required",
        code: "MISSING_PROJECT_ID" 
      }, { status: 400 });
    }

    if (isNaN(parseInt(projectId))) {
      return NextResponse.json({ 
        error: "Valid project ID is required",
        code: "INVALID_PROJECT_ID" 
      }, { status: 400 });
    }

    const project = await db.select()
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (project.length === 0) {
      return NextResponse.json({ 
        error: "Project not found",
        code: "PROJECT_NOT_FOUND" 
      }, { status: 400 });
    }

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ 
        error: "Title is required",
        code: "MISSING_TITLE" 
      }, { status: 400 });
    }

    if (!dueDate) {
      return NextResponse.json({ 
        error: "Due date is required",
        code: "MISSING_DUE_DATE" 
      }, { status: 400 });
    }

    if (!isValidDate(dueDate)) {
      return NextResponse.json({ 
        error: "Valid due date is required",
        code: "INVALID_DUE_DATE" 
      }, { status: 400 });
    }

    if (status && !isValidStatus(status)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const dueDateISO = new Date(dueDate).toISOString();

    const newMilestone = await db.insert(milestones)
      .values({
        projectId: parseInt(projectId),
        title: title.trim(),
        description: description ? description.trim() : null,
        dueDate: dueDateISO,
        status: status && isValidStatus(status) ? status : 'pending',
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return NextResponse.json(newMilestone[0], { status: 201 });

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

    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    if ('id' in body) {
      return NextResponse.json({ 
        error: "ID cannot be updated",
        code: "ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    if ('projectId' in body) {
      return NextResponse.json({ 
        error: "Project ID cannot be updated",
        code: "PROJECT_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const existing = await db.select()
      .from(milestones)
      .where(eq(milestones.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Milestone not found',
        code: 'MILESTONE_NOT_FOUND' 
      }, { status: 404 });
    }

    const { title, description, dueDate, status } = body;
    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return NextResponse.json({ 
          error: "Title cannot be empty",
          code: "INVALID_TITLE" 
        }, { status: 400 });
      }
      updates.title = title.trim();
    }

    if (description !== undefined) {
      updates.description = description ? description.trim() : null;
    }

    if (dueDate !== undefined) {
      if (!isValidDate(dueDate)) {
        return NextResponse.json({ 
          error: "Valid due date is required",
          code: "INVALID_DUE_DATE" 
        }, { status: 400 });
      }
      updates.dueDate = new Date(dueDate).toISOString();
    }

    if (status !== undefined) {
      if (!isValidStatus(status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
      updates.status = status;
    }

    const updated = await db.update(milestones)
      .set(updates)
      .where(eq(milestones.id, parseInt(id)))
      .returning();

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

    const existing = await db.select()
      .from(milestones)
      .where(eq(milestones.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Milestone not found',
        code: 'MILESTONE_NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(milestones)
      .where(eq(milestones.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Milestone deleted successfully',
      milestone: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}