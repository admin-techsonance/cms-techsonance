import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tasks, projects, users, milestones, sprints } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

const VALID_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high'] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single task by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const task = await db.select()
        .from(tasks)
        .where(eq(tasks.id, parseInt(id)))
        .limit(1);

      if (task.length === 0) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json(task[0], { status: 200 });
    }

    // List tasks with filters and pagination
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const projectId = searchParams.get('projectId');
    const milestoneId = searchParams.get('milestoneId');
    const sprintId = searchParams.get('sprintId');
    const assignedTo = searchParams.get('assignedTo');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const sort = searchParams.get('sort') || 'id';
    const order = searchParams.get('order') || 'desc';

    let query = db.select().from(tasks);
    const conditions = [];

    // Search by title or description
    if (search) {
      conditions.push(
        or(
          like(tasks.title, `%${search}%`),
          like(tasks.description, `%${search}%`)
        )
      );
    }

    // Filter by projectId
    if (projectId) {
      const projectIdNum = parseInt(projectId);
      if (!isNaN(projectIdNum)) {
        conditions.push(eq(tasks.projectId, projectIdNum));
      }
    }

    // Filter by milestoneId
    if (milestoneId) {
      const milestoneIdNum = parseInt(milestoneId);
      if (!isNaN(milestoneIdNum)) {
        conditions.push(eq(tasks.milestoneId, milestoneIdNum));
      }
    }

    // Add sprintId filter
    if (sprintId) {
      const sprintIdNum = parseInt(sprintId);
      if (!isNaN(sprintIdNum)) {
        conditions.push(eq(tasks.sprintId, sprintIdNum));
      }
    }

    // Filter by assignedTo
    if (assignedTo) {
      const assignedToNum = parseInt(assignedTo);
      if (!isNaN(assignedToNum)) {
        conditions.push(eq(tasks.assignedTo, assignedToNum));
      }
    }

    // Filter by status
    if (status) {
      conditions.push(eq(tasks.status, status));
    }

    // Filter by priority
    if (priority) {
      conditions.push(eq(tasks.priority, priority));
    }

    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    if (sort === 'dueDate') {
      query = order === 'asc' ? query.orderBy(asc(tasks.dueDate)) : query.orderBy(desc(tasks.dueDate));
    } else if (sort === 'priority') {
      query = order === 'asc' ? query.orderBy(asc(tasks.priority)) : query.orderBy(desc(tasks.priority));
    } else if (sort === 'status') {
      query = order === 'asc' ? query.orderBy(asc(tasks.status)) : query.orderBy(desc(tasks.status));
    } else {
      query = order === 'asc' ? query.orderBy(asc(tasks.id)) : query.orderBy(desc(tasks.id));
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

    // Security check: reject if user identifier fields provided
    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { projectId, title, assignedTo, description, milestoneId, sprintId, storyPoints, dueDate, status, priority } = body;

    // Validate required fields
    if (!projectId) {
      return NextResponse.json({ 
        error: "Project ID is required",
        code: "MISSING_PROJECT_ID" 
      }, { status: 400 });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ 
        error: "Valid title is required",
        code: "MISSING_TITLE" 
      }, { status: 400 });
    }

    if (!assignedTo) {
      return NextResponse.json({ 
        error: "Assigned to user ID is required",
        code: "MISSING_ASSIGNED_TO" 
      }, { status: 400 });
    }

    // Validate projectId exists
    const projectExists = await db.select()
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (projectExists.length === 0) {
      return NextResponse.json({ 
        error: "Project not found",
        code: "INVALID_PROJECT_ID" 
      }, { status: 400 });
    }

    // Validate assignedTo user exists
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(assignedTo)))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "Assigned user not found",
        code: "INVALID_ASSIGNED_TO" 
      }, { status: 400 });
    }

    // Validate milestoneId if provided
    if (milestoneId) {
      const milestoneExists = await db.select()
        .from(milestones)
        .where(eq(milestones.id, parseInt(milestoneId)))
        .limit(1);

      if (milestoneExists.length === 0) {
        return NextResponse.json({ 
          error: "Milestone not found",
          code: "INVALID_MILESTONE_ID" 
        }, { status: 400 });
      }
    }

    // Validate sprintId if provided
    if (sprintId !== undefined && sprintId !== null) {
      const sprintIdNum = parseInt(sprintId);
      if (isNaN(sprintIdNum)) {
        return NextResponse.json({ 
          error: "Valid sprint ID is required",
          code: "INVALID_SPRINT_ID" 
        }, { status: 400 });
      }

      const sprintExists = await db.select()
        .from(sprints)
        .where(eq(sprints.id, sprintIdNum))
        .limit(1);

      if (sprintExists.length === 0) {
        return NextResponse.json({ 
          error: "Sprint not found",
          code: "SPRINT_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    // Validate storyPoints if provided
    if (storyPoints !== undefined && storyPoints !== null) {
      const validStoryPoints = [1, 2, 3, 5, 8, 13, 21];
      const points = parseInt(storyPoints);
      if (isNaN(points) || !validStoryPoints.includes(points)) {
        return NextResponse.json({ 
          error: "Story points must be one of: 1, 2, 3, 5, 8, 13, 21",
          code: "INVALID_STORY_POINTS" 
        }, { status: 400 });
      }
    }

    // Validate status enum if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate priority enum if provided
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ 
        error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        code: "INVALID_PRIORITY" 
      }, { status: 400 });
    }

    // Prepare task data
    const taskData: any = {
      projectId: parseInt(projectId),
      title: title.trim(),
      assignedTo: parseInt(assignedTo),
      status: status || 'todo',
      priority: priority || 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add optional fields if provided
    if (description) {
      taskData.description = description.trim();
    }

    if (milestoneId) {
      taskData.milestoneId = parseInt(milestoneId);
    }

    if (sprintId !== undefined && sprintId !== null) {
      taskData.sprintId = parseInt(sprintId);
    }

    if (storyPoints !== undefined && storyPoints !== null) {
      taskData.storyPoints = parseInt(storyPoints);
    }

    if (dueDate) {
      taskData.dueDate = dueDate;
    }

    const newTask = await db.insert(tasks)
      .values(taskData)
      .returning();

    return NextResponse.json(newTask[0], { status: 201 });
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

    // Security check: reject if user identifier fields provided
    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if task exists
    const existingTask = await db.select()
      .from(tasks)
      .where(eq(tasks.id, parseInt(id)))
      .limit(1);

    if (existingTask.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { title, description, assignedTo, milestoneId, sprintId, storyPoints, status, priority, dueDate } = body;

    // Validate assignedTo user if provided
    if (assignedTo) {
      const userExists = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(assignedTo)))
        .limit(1);

      if (userExists.length === 0) {
        return NextResponse.json({ 
          error: "Assigned user not found",
          code: "INVALID_ASSIGNED_TO" 
        }, { status: 400 });
      }
    }

    // Validate milestoneId if provided
    if (milestoneId !== undefined && milestoneId !== null) {
      const milestoneExists = await db.select()
        .from(milestones)
        .where(eq(milestones.id, parseInt(milestoneId)))
        .limit(1);

      if (milestoneExists.length === 0) {
        return NextResponse.json({ 
          error: "Milestone not found",
          code: "INVALID_MILESTONE_ID" 
        }, { status: 400 });
      }
    }

    // Validate sprintId if provided
    if (sprintId !== undefined) {
      if (sprintId === null) {
        // Allow unsetting sprintId
      } else {
        const sprintIdNum = parseInt(sprintId);
        if (isNaN(sprintIdNum)) {
          return NextResponse.json({ 
            error: "Valid sprint ID is required",
            code: "INVALID_SPRINT_ID" 
          }, { status: 400 });
        }

        const sprintExists = await db.select()
          .from(sprints)
          .where(eq(sprints.id, sprintIdNum))
          .limit(1);

        if (sprintExists.length === 0) {
          return NextResponse.json({ 
            error: "Sprint not found",
            code: "SPRINT_NOT_FOUND" 
          }, { status: 400 });
        }
      }
    }

    // Validate storyPoints if provided
    if (storyPoints !== undefined) {
      if (storyPoints !== null) {
        const validStoryPoints = [1, 2, 3, 5, 8, 13, 21];
        const points = parseInt(storyPoints);
        if (isNaN(points) || !validStoryPoints.includes(points)) {
          return NextResponse.json({ 
            error: "Story points must be one of: 1, 2, 3, 5, 8, 13, 21",
            code: "INVALID_STORY_POINTS" 
          }, { status: 400 });
        }
      }
    }

    // Validate status enum if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate priority enum if provided
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ 
        error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        code: "INVALID_PRIORITY" 
      }, { status: 400 });
    }

    // Prepare update data (excluding id and projectId)
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ 
          error: "Valid title is required",
          code: "INVALID_TITLE" 
        }, { status: 400 });
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description = description ? description.trim() : description;
    }

    if (assignedTo !== undefined) {
      updateData.assignedTo = parseInt(assignedTo);
    }

    if (milestoneId !== undefined) {
      updateData.milestoneId = milestoneId ? parseInt(milestoneId) : null;
    }

    if (sprintId !== undefined) {
      updateData.sprintId = sprintId ? parseInt(sprintId) : null;
    }

    if (storyPoints !== undefined) {
      updateData.storyPoints = storyPoints ? parseInt(storyPoints) : null;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (priority !== undefined) {
      updateData.priority = priority;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate;
    }

    const updated = await db.update(tasks)
      .set(updateData)
      .where(eq(tasks.id, parseInt(id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
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

    // Check if task exists
    const existingTask = await db.select()
      .from(tasks)
      .where(eq(tasks.id, parseInt(id)))
      .limit(1);

    if (existingTask.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const deleted = await db.delete(tasks)
      .where(eq(tasks.id, parseInt(id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Task deleted successfully',
      task: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}