import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { portfolio } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
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

      const record = await db.select()
        .from(portfolio)
        .where(eq(portfolio.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Portfolio item not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with pagination, search, and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const technology = searchParams.get('technology');

    let query = db.select().from(portfolio);
    const conditions = [];

    // Search across title and clientName
    if (search) {
      conditions.push(
        or(
          like(portfolio.title, `%${search}%`),
          like(portfolio.clientName, `%${search}%`)
        )
      );
    }

    // Filter by category
    if (category) {
      conditions.push(eq(portfolio.category, category));
    }

    // Filter by status
    if (status) {
      conditions.push(eq(portfolio.status, status));
    }

    // Filter by technology (JSON array search)
    if (technology) {
      conditions.push(like(portfolio.technologies, `%${technology}%`));
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Sort by createdAt DESC
    const results = await query
      .orderBy(desc(portfolio.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, clientName, category, description, projectUrl, thumbnail, images, technologies } = body;

    // Validate required fields
    if (!title || title.trim() === '') {
      return NextResponse.json({ 
        error: "Title is required",
        code: "MISSING_TITLE" 
      }, { status: 400 });
    }

    if (!clientName || clientName.trim() === '') {
      return NextResponse.json({ 
        error: "Client name is required",
        code: "MISSING_CLIENT_NAME" 
      }, { status: 400 });
    }

    if (!category || category.trim() === '') {
      return NextResponse.json({ 
        error: "Category is required",
        code: "MISSING_CATEGORY" 
      }, { status: 400 });
    }

    // Validate images is valid JSON array if provided
    if (images !== undefined && images !== null) {
      if (!Array.isArray(images)) {
        return NextResponse.json({ 
          error: "Images must be a valid JSON array",
          code: "INVALID_IMAGES_FORMAT" 
        }, { status: 400 });
      }
    }

    // Validate technologies is valid JSON array if provided
    if (technologies !== undefined && technologies !== null) {
      if (!Array.isArray(technologies)) {
        return NextResponse.json({ 
          error: "Technologies must be a valid JSON array",
          code: "INVALID_TECHNOLOGIES_FORMAT" 
        }, { status: 400 });
      }
    }

    // Prepare insert data
    const insertData: any = {
      title: title.trim(),
      clientName: clientName.trim(),
      category: category.trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (description !== undefined && description !== null) {
      insertData.description = description.trim();
    }

    if (projectUrl !== undefined && projectUrl !== null) {
      insertData.projectUrl = projectUrl.trim();
    }

    if (thumbnail !== undefined && thumbnail !== null) {
      insertData.thumbnail = thumbnail.trim();
    }

    if (images !== undefined && images !== null) {
      insertData.images = JSON.stringify(images);
    }

    if (technologies !== undefined && technologies !== null) {
      insertData.technologies = JSON.stringify(technologies);
    }

    const newRecord = await db.insert(portfolio)
      .values(insertData)
      .returning();

    return NextResponse.json(newRecord[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
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

    // Check if record exists
    const existing = await db.select()
      .from(portfolio)
      .where(eq(portfolio.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Portfolio item not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const body = await request.json();
    const { title, clientName, category, description, projectUrl, thumbnail, images, technologies, status } = body;

    // Validate status enum if provided
    if (status !== undefined && status !== null) {
      const validStatuses = ['active', 'archived'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          error: "Status must be either 'active' or 'archived'",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }
    }

    // Validate images is valid JSON array if provided
    if (images !== undefined && images !== null) {
      if (!Array.isArray(images)) {
        return NextResponse.json({ 
          error: "Images must be a valid JSON array",
          code: "INVALID_IMAGES_FORMAT" 
        }, { status: 400 });
      }
    }

    // Validate technologies is valid JSON array if provided
    if (technologies !== undefined && technologies !== null) {
      if (!Array.isArray(technologies)) {
        return NextResponse.json({ 
          error: "Technologies must be a valid JSON array",
          code: "INVALID_TECHNOLOGIES_FORMAT" 
        }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (title !== undefined && title !== null) {
      if (title.trim() === '') {
        return NextResponse.json({ 
          error: "Title cannot be empty",
          code: "EMPTY_TITLE" 
        }, { status: 400 });
      }
      updateData.title = title.trim();
    }

    if (clientName !== undefined && clientName !== null) {
      if (clientName.trim() === '') {
        return NextResponse.json({ 
          error: "Client name cannot be empty",
          code: "EMPTY_CLIENT_NAME" 
        }, { status: 400 });
      }
      updateData.clientName = clientName.trim();
    }

    if (category !== undefined && category !== null) {
      if (category.trim() === '') {
        return NextResponse.json({ 
          error: "Category cannot be empty",
          code: "EMPTY_CATEGORY" 
        }, { status: 400 });
      }
      updateData.category = category.trim();
    }

    if (description !== undefined) {
      updateData.description = description !== null ? description.trim() : null;
    }

    if (projectUrl !== undefined) {
      updateData.projectUrl = projectUrl !== null ? projectUrl.trim() : null;
    }

    if (thumbnail !== undefined) {
      updateData.thumbnail = thumbnail !== null ? thumbnail.trim() : null;
    }

    if (images !== undefined) {
      updateData.images = images !== null ? JSON.stringify(images) : null;
    }

    if (technologies !== undefined) {
      updateData.technologies = technologies !== null ? JSON.stringify(technologies) : null;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    const updated = await db.update(portfolio)
      .set(updateData)
      .where(eq(portfolio.id, parseInt(id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update portfolio item',
        code: 'UPDATE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
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

    // Check if record exists
    const existing = await db.select()
      .from(portfolio)
      .where(eq(portfolio.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Portfolio item not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Soft delete by setting status to 'archived'
    const deleted = await db.update(portfolio)
      .set({ status: 'archived' })
      .where(eq(portfolio.id, parseInt(id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to delete portfolio item',
        code: 'DELETE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      message: 'Portfolio item archived successfully',
      data: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}