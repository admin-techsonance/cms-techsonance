import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projectDocuments, projects, users } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single document by ID
    if (id) {
      if (isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: "Valid ID is required",
          code: "INVALID_ID" 
        }, { status: 400 });
      }

      const document = await db.select()
        .from(projectDocuments)
        .where(eq(projectDocuments.id, parseInt(id)))
        .limit(1);

      if (document.length === 0) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      return NextResponse.json(document[0]);
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const projectId = searchParams.get('projectId');
    const uploadedBy = searchParams.get('uploadedBy');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') ?? 'uploadedAt';
    const order = searchParams.get('order') ?? 'desc';

    let query = db.select().from(projectDocuments);

    // Build filter conditions
    const conditions = [];

    if (projectId) {
      if (isNaN(parseInt(projectId))) {
        return NextResponse.json({ 
          error: "Valid project ID is required",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }
      conditions.push(eq(projectDocuments.projectId, parseInt(projectId)));
    }

    if (uploadedBy) {
      if (isNaN(parseInt(uploadedBy))) {
        return NextResponse.json({ 
          error: "Valid uploaded by user ID is required",
          code: "INVALID_UPLOADED_BY" 
        }, { status: 400 });
      }
      conditions.push(eq(projectDocuments.uploadedBy, parseInt(uploadedBy)));
    }

    if (search) {
      conditions.push(
        or(
          like(projectDocuments.name, `%${search}%`),
          like(projectDocuments.fileUrl, `%${search}%`)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    const sortColumn = sort === 'name' ? projectDocuments.name : projectDocuments.uploadedAt;
    query = order === 'asc' 
      ? query.orderBy(asc(sortColumn))
      : query.orderBy(desc(sortColumn));

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

    // Security check: reject if uploadedBy provided in body
    if ('uploadedBy' in body || 'uploaded_by' in body) {
      return NextResponse.json({ 
        error: "Uploaded by user ID cannot be provided in request body",
        code: "UPLOADED_BY_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { projectId, name, fileUrl } = body;

    // Validate required fields
    if (!projectId) {
      return NextResponse.json({ 
        error: "Project ID is required",
        code: "MISSING_PROJECT_ID" 
      }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ 
        error: "Valid document name is required",
        code: "INVALID_NAME" 
      }, { status: 400 });
    }

    if (!fileUrl || typeof fileUrl !== 'string' || fileUrl.trim() === '') {
      return NextResponse.json({ 
        error: "Valid file URL is required",
        code: "INVALID_FILE_URL" 
      }, { status: 400 });
    }

    // Validate projectId is a number
    if (isNaN(parseInt(projectId))) {
      return NextResponse.json({ 
        error: "Valid project ID is required",
        code: "INVALID_PROJECT_ID" 
      }, { status: 400 });
    }

    // Validate project exists
    const project = await db.select()
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (project.length === 0) {
      return NextResponse.json({ 
        error: "Project not found",
        code: "PROJECT_NOT_FOUND" 
      }, { status: 404 });
    }

    // Validate user exists (uploadedBy)
    const uploadingUser = await db.select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (uploadingUser.length === 0) {
      return NextResponse.json({ 
        error: "User not found",
        code: "USER_NOT_FOUND" 
      }, { status: 404 });
    }

    // Create document
    const newDocument = await db.insert(projectDocuments)
      .values({
        projectId: parseInt(projectId),
        name: name.trim(),
        fileUrl: fileUrl.trim(),
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newDocument[0], { status: 201 });
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

    // Security check: reject if uploadedBy provided in body
    if ('uploadedBy' in body || 'uploaded_by' in body) {
      return NextResponse.json({ 
        error: "Uploaded by user ID cannot be provided in request body",
        code: "UPLOADED_BY_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if document exists
    const existingDocument = await db.select()
      .from(projectDocuments)
      .where(eq(projectDocuments.id, parseInt(id)))
      .limit(1);

    if (existingDocument.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const updates: {
      name?: string;
      fileUrl?: string;
      projectId?: number;
    } = {};

    // Validate and prepare updates
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        return NextResponse.json({ 
          error: "Valid document name is required",
          code: "INVALID_NAME" 
        }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.fileUrl !== undefined) {
      if (typeof body.fileUrl !== 'string' || body.fileUrl.trim() === '') {
        return NextResponse.json({ 
          error: "Valid file URL is required",
          code: "INVALID_FILE_URL" 
        }, { status: 400 });
      }
      updates.fileUrl = body.fileUrl.trim();
    }

    if (body.projectId !== undefined) {
      if (isNaN(parseInt(body.projectId))) {
        return NextResponse.json({ 
          error: "Valid project ID is required",
          code: "INVALID_PROJECT_ID" 
        }, { status: 400 });
      }

      // Validate project exists
      const project = await db.select()
        .from(projects)
        .where(eq(projects.id, parseInt(body.projectId)))
        .limit(1);

      if (project.length === 0) {
        return NextResponse.json({ 
          error: "Project not found",
          code: "PROJECT_NOT_FOUND" 
        }, { status: 404 });
      }

      updates.projectId = parseInt(body.projectId);
    }

    // Update document
    const updatedDocument = await db.update(projectDocuments)
      .set(updates)
      .where(eq(projectDocuments.id, parseInt(id)))
      .returning();

    return NextResponse.json(updatedDocument[0]);
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

    // Check if document exists
    const existingDocument = await db.select()
      .from(projectDocuments)
      .where(eq(projectDocuments.id, parseInt(id)))
      .limit(1);

    if (existingDocument.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Delete document
    const deleted = await db.delete(projectDocuments)
      .where(eq(projectDocuments.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Document deleted successfully',
      document: deleted[0]
    });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}