import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, clients, users } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const VALID_STATUSES = ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

type ProjectStatus = typeof VALID_STATUSES[number];
type ProjectPriority = typeof VALID_PRIORITIES[number];

function isValidStatus(status: string): status is ProjectStatus {
  return VALID_STATUSES.includes(status as ProjectStatus);
}

function isValidPriority(priority: string): priority is ProjectPriority {
  return VALID_PRIORITIES.includes(priority as ProjectPriority);
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
      const projectId = parseInt(id);
      if (isNaN(projectId)) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const project = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (project.length === 0) {
        return NextResponse.json({ 
          error: 'Project not found',
          code: 'PROJECT_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(project[0], { status: 200 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const createdBy = searchParams.get('createdBy');
    const isActive = searchParams.get('isActive');
    const sortBy = searchParams.get('sort');
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(projects);
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          like(projects.name, `%${search}%`),
          like(projects.description, `%${search}%`)
        )
      );
    }

    if (clientId) {
      const clientIdNum = parseInt(clientId);
      if (!isNaN(clientIdNum)) {
        conditions.push(eq(projects.clientId, clientIdNum));
      }
    }

    if (status) {
      if (isValidStatus(status)) {
        conditions.push(eq(projects.status, status));
      } else {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }
    }

    if (priority) {
      if (isValidPriority(priority)) {
        conditions.push(eq(projects.priority, priority));
      } else {
        return NextResponse.json({ 
          error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
          code: 'INVALID_PRIORITY' 
        }, { status: 400 });
      }
    }

    if (createdBy) {
      const createdByNum = parseInt(createdBy);
      if (!isNaN(createdByNum)) {
        conditions.push(eq(projects.createdBy, createdByNum));
      }
    }

    if (isActive !== null && isActive !== undefined) {
      const isActiveBool = isActive === 'true';
      conditions.push(eq(projects.isActive, isActiveBool));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (sortBy) {
      const validSortFields = ['startDate', 'endDate', 'budget'];
      if (validSortFields.includes(sortBy)) {
        const orderFn = order.toLowerCase() === 'asc' ? asc : desc;
        if (sortBy === 'startDate') {
          query = query.orderBy(orderFn(projects.startDate));
        } else if (sortBy === 'endDate') {
          query = query.orderBy(orderFn(projects.endDate));
        } else if (sortBy === 'budget') {
          query = query.orderBy(orderFn(projects.budget));
        }
      }
    } else {
      query = query.orderBy(desc(projects.createdAt));
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

    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { name, clientId, description, startDate, endDate, budget, status, priority, isActive } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ 
        error: 'Project name is required',
        code: 'MISSING_NAME' 
      }, { status: 400 });
    }

    if (!clientId) {
      return NextResponse.json({ 
        error: 'Client ID is required',
        code: 'MISSING_CLIENT_ID' 
      }, { status: 400 });
    }

    const clientIdNum = parseInt(clientId);
    if (isNaN(clientIdNum)) {
      return NextResponse.json({ 
        error: 'Client ID must be a valid number',
        code: 'INVALID_CLIENT_ID' 
      }, { status: 400 });
    }

    const client = await db.select()
      .from(clients)
      .where(eq(clients.id, clientIdNum))
      .limit(1);

    if (client.length === 0) {
      return NextResponse.json({ 
        error: 'Client does not exist',
        code: 'CLIENT_NOT_FOUND' 
      }, { status: 400 });
    }

    const projectStatus = status || 'planning';
    if (!isValidStatus(projectStatus)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        code: 'INVALID_STATUS' 
      }, { status: 400 });
    }

    const projectPriority = priority || 'medium';
    if (!isValidPriority(projectPriority)) {
      return NextResponse.json({ 
        error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        code: 'INVALID_PRIORITY' 
      }, { status: 400 });
    }

    if (budget !== undefined && budget !== null) {
      const budgetNum = parseInt(budget);
      if (isNaN(budgetNum) || budgetNum < 0) {
        return NextResponse.json({ 
          error: 'Budget must be a valid positive number',
          code: 'INVALID_BUDGET' 
        }, { status: 400 });
      }
    }

    const now = new Date().toISOString();

    const newProject = await db.insert(projects)
      .values({
        name: name.trim(),
        description: description ? description.trim() : null,
        clientId: clientIdNum,
        status: projectStatus,
        priority: projectPriority,
        startDate: startDate || null,
        endDate: endDate || null,
        budget: budget ? parseInt(budget) : null,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json(newProject[0], { status: 201 });
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

    if (!id) {
      return NextResponse.json({ 
        error: 'Project ID is required',
        code: 'MISSING_ID' 
      }, { status: 400 });
    }

    const projectId = parseInt(id);
    if (isNaN(projectId)) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    const body = await request.json();

    if ('userId' in body || 'user_id' in body || 'createdBy' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const existingProject = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return NextResponse.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 404 });
    }

    const { name, clientId, description, startDate, endDate, budget, status, priority, isActive } = body;

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ 
          error: 'Project name cannot be empty',
          code: 'INVALID_NAME' 
        }, { status: 400 });
      }
      updates.name = name.trim();
    }

    if (clientId !== undefined) {
      const clientIdNum = parseInt(clientId);
      if (isNaN(clientIdNum)) {
        return NextResponse.json({ 
          error: 'Client ID must be a valid number',
          code: 'INVALID_CLIENT_ID' 
        }, { status: 400 });
      }

      const client = await db.select()
        .from(clients)
        .where(eq(clients.id, clientIdNum))
        .limit(1);

      if (client.length === 0) {
        return NextResponse.json({ 
          error: 'Client does not exist',
          code: 'CLIENT_NOT_FOUND' 
        }, { status: 400 });
      }

      updates.clientId = clientIdNum;
    }

    if (description !== undefined) {
      updates.description = description ? description.trim() : null;
    }

    if (status !== undefined) {
      if (!isValidStatus(status)) {
        return NextResponse.json({ 
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }
      updates.status = status;
    }

    if (priority !== undefined) {
      if (!isValidPriority(priority)) {
        return NextResponse.json({ 
          error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
          code: 'INVALID_PRIORITY' 
        }, { status: 400 });
      }
      updates.priority = priority;
    }

    if (startDate !== undefined) {
      updates.startDate = startDate || null;
    }

    if (endDate !== undefined) {
      updates.endDate = endDate || null;
    }

    if (budget !== undefined) {
      if (budget !== null) {
        const budgetNum = parseInt(budget);
        if (isNaN(budgetNum) || budgetNum < 0) {
          return NextResponse.json({ 
            error: 'Budget must be a valid positive number',
            code: 'INVALID_BUDGET' 
          }, { status: 400 });
        }
        updates.budget = budgetNum;
      } else {
        updates.budget = null;
      }
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return NextResponse.json({ 
          error: 'isActive must be a boolean',
          code: 'INVALID_IS_ACTIVE' 
        }, { status: 400 });
      }
      updates.isActive = isActive;
    }

    const updatedProject = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, projectId))
      .returning();

    if (updatedProject.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update project',
        code: 'UPDATE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json(updatedProject[0], { status: 200 });
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

    if (!id) {
      return NextResponse.json({ 
        error: 'Project ID is required',
        code: 'MISSING_ID' 
      }, { status: 400 });
    }

    const projectId = parseInt(id);
    if (isNaN(projectId)) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    const existingProject = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (existingProject.length === 0) {
      return NextResponse.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 404 });
    }

    const deletedProject = await db.update(projects)
      .set({
        status: 'cancelled',
        updatedAt: new Date().toISOString()
      })
      .where(eq(projects.id, projectId))
      .returning();

    return NextResponse.json({
      message: 'Project successfully cancelled',
      project: deletedProject[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}