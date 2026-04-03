import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { pages, users } from '@/db/schema';
import { eq, like, and, or, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const slug = searchParams.get('slug');

    // Single record fetch by ID or slug
    if (id || slug) {
      if (id && isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const whereCondition = id 
        ? eq(pages.id, parseInt(id))
        : eq(pages.slug, slug as string);

      const page = await db.select()
        .from(pages)
        .where(whereCondition)
        .limit(1);

      if (page.length === 0) {
        return NextResponse.json({ 
          error: 'Page not found',
          code: 'PAGE_NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(page[0], { status: 200 });
    }

    // List with pagination, search, and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const createdBy = searchParams.get('createdBy');

    let query = db.select().from(pages);
    const conditions = [];

    // Search by title or slug
    if (search) {
      conditions.push(
        or(
          like(pages.title, `%${search}%`),
          like(pages.slug, `%${search}%`)
        )
      );
    }

    // Filter by status
    if (status) {
      conditions.push(eq(pages.status, status));
    }

    // Filter by createdBy
    if (createdBy) {
      if (isNaN(parseInt(createdBy))) {
        return NextResponse.json({ 
          error: 'Valid createdBy ID is required',
          code: 'INVALID_CREATED_BY' 
        }, { status: 400 });
      }
      conditions.push(eq(pages.createdBy, parseInt(createdBy)));
    }

    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }

    const results = await query
      .orderBy(desc(pages.updatedAt))
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

    // Security check: reject if userId provided in body
    if ('userId' in body || 'user_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { 
      title, 
      slug, 
      createdBy, 
      content, 
      metaTitle, 
      metaDescription, 
      metaKeywords,
      status 
    } = body;

    // Validate required fields
    if (!title || title.trim() === '') {
      return NextResponse.json({ 
        error: 'Title is required',
        code: 'MISSING_TITLE' 
      }, { status: 400 });
    }

    if (!slug || slug.trim() === '') {
      return NextResponse.json({ 
        error: 'Slug is required',
        code: 'MISSING_SLUG' 
      }, { status: 400 });
    }

    if (!createdBy) {
      return NextResponse.json({ 
        error: 'createdBy is required',
        code: 'MISSING_CREATED_BY' 
      }, { status: 400 });
    }

    // Validate slug is URL-friendly
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug.trim())) {
      return NextResponse.json({ 
        error: 'Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)',
        code: 'INVALID_SLUG_FORMAT' 
      }, { status: 400 });
    }

    // Validate status enum
    const validStatuses = ['draft', 'published'];
    const pageStatus = status || 'draft';
    if (!validStatuses.includes(pageStatus)) {
      return NextResponse.json({ 
        error: 'Status must be either "draft" or "published"',
        code: 'INVALID_STATUS' 
      }, { status: 400 });
    }

    // Check if slug already exists
    const existingSlug = await db.select()
      .from(pages)
      .where(eq(pages.slug, slug.trim()))
      .limit(1);

    if (existingSlug.length > 0) {
      return NextResponse.json({ 
        error: 'Slug already exists. Please use a unique slug',
        code: 'SLUG_EXISTS' 
      }, { status: 400 });
    }

    // Validate createdBy user exists
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, parseInt(createdBy)))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: 'createdBy user does not exist',
        code: 'INVALID_CREATED_BY' 
      }, { status: 400 });
    }

    // Prepare insert data
    const now = new Date().toISOString();
    const insertData: any = {
      title: title.trim(),
      slug: slug.trim(),
      createdBy: parseInt(createdBy),
      status: pageStatus,
      createdAt: now,
      updatedAt: now,
    };

    // Add optional fields if provided
    if (content !== undefined) {
      insertData.content = content;
    }
    if (metaTitle !== undefined) {
      insertData.metaTitle = metaTitle.trim();
    }
    if (metaDescription !== undefined) {
      insertData.metaDescription = metaDescription.trim();
    }
    if (metaKeywords !== undefined) {
      insertData.metaKeywords = metaKeywords.trim();
    }

    // Set publishedAt if status is published
    if (pageStatus === 'published') {
      insertData.publishedAt = now;
    }

    const newPage = await db.insert(pages)
      .values(insertData)
      .returning();

    return NextResponse.json(newPage[0], { status: 201 });
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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
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

    // Check if page exists
    const existingPage = await db.select()
      .from(pages)
      .where(eq(pages.id, parseInt(id)))
      .limit(1);

    if (existingPage.length === 0) {
      return NextResponse.json({ 
        error: 'Page not found',
        code: 'PAGE_NOT_FOUND' 
      }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    // Validate and update fields
    if (body.title !== undefined) {
      if (body.title.trim() === '') {
        return NextResponse.json({ 
          error: 'Title cannot be empty',
          code: 'INVALID_TITLE' 
        }, { status: 400 });
      }
      updateData.title = body.title.trim();
    }

    if (body.slug !== undefined) {
      if (body.slug.trim() === '') {
        return NextResponse.json({ 
          error: 'Slug cannot be empty',
          code: 'INVALID_SLUG' 
        }, { status: 400 });
      }

      // Validate slug is URL-friendly
      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(body.slug.trim())) {
        return NextResponse.json({ 
          error: 'Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)',
          code: 'INVALID_SLUG_FORMAT' 
        }, { status: 400 });
      }

      // Check if new slug already exists (excluding current page)
      const existingSlug = await db.select()
        .from(pages)
        .where(and(
          eq(pages.slug, body.slug.trim()),
          eq(pages.id, parseInt(id))
        ))
        .limit(1);

      // If no results, check if slug exists for other pages
      if (existingSlug.length === 0) {
        const otherSlug = await db.select()
          .from(pages)
          .where(eq(pages.slug, body.slug.trim()))
          .limit(1);

        if (otherSlug.length > 0) {
          return NextResponse.json({ 
            error: 'Slug already exists. Please use a unique slug',
            code: 'SLUG_EXISTS' 
          }, { status: 400 });
        }
      }

      updateData.slug = body.slug.trim();
    }

    if (body.content !== undefined) {
      updateData.content = body.content;
    }

    if (body.metaTitle !== undefined) {
      updateData.metaTitle = body.metaTitle.trim();
    }

    if (body.metaDescription !== undefined) {
      updateData.metaDescription = body.metaDescription.trim();
    }

    if (body.metaKeywords !== undefined) {
      updateData.metaKeywords = body.metaKeywords.trim();
    }

    if (body.status !== undefined) {
      const validStatuses = ['draft', 'published'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ 
          error: 'Status must be either "draft" or "published"',
          code: 'INVALID_STATUS' 
        }, { status: 400 });
      }

      updateData.status = body.status;

      // Set publishedAt when status changes to published
      if (body.status === 'published' && existingPage[0].status !== 'published') {
        updateData.publishedAt = new Date().toISOString();
      }
    }

    if (body.createdBy !== undefined) {
      // Validate createdBy user exists
      const userExists = await db.select()
        .from(users)
        .where(eq(users.id, parseInt(body.createdBy)))
        .limit(1);

      if (userExists.length === 0) {
        return NextResponse.json({ 
          error: 'createdBy user does not exist',
          code: 'INVALID_CREATED_BY' 
        }, { status: 400 });
      }

      updateData.createdBy = parseInt(body.createdBy);
    }

    const updated = await db.update(pages)
      .set(updateData)
      .where(eq(pages.id, parseInt(id)))
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
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if page exists
    const existingPage = await db.select()
      .from(pages)
      .where(eq(pages.id, parseInt(id)))
      .limit(1);

    if (existingPage.length === 0) {
      return NextResponse.json({ 
        error: 'Page not found',
        code: 'PAGE_NOT_FOUND' 
      }, { status: 404 });
    }

    const deleted = await db.delete(pages)
      .where(eq(pages.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Page deleted successfully',
      page: deleted[0] 
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}