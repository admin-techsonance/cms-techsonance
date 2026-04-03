import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { blogs, users } from '@/db/schema';
import { eq, like, and, or, desc, asc, sql } from 'drizzle-orm';
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
    const slug = searchParams.get('slug');

    // Single record by ID or slug
    if (id || slug) {
      let whereCondition;
      
      if (id) {
        const blogId = parseInt(id);
        if (isNaN(blogId)) {
          return NextResponse.json({ 
            error: 'Valid ID is required',
            code: 'INVALID_ID' 
          }, { status: 400 });
        }
        whereCondition = and(
          eq(blogs.id, blogId),
          eq(blogs.authorId, user.id)
        );
      } else if (slug) {
        whereCondition = and(
          eq(blogs.slug, slug),
          eq(blogs.authorId, user.id)
        );
      }

      const blog = await db.select()
        .from(blogs)
        .where(whereCondition)
        .limit(1);

      if (blog.length === 0) {
        return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
      }

      // Increment views when retrieving by slug
      if (slug) {
        await db.update(blogs)
          .set({ views: (blog[0].views || 0) + 1 })
          .where(and(
            eq(blogs.slug, slug),
            eq(blogs.authorId, user.id)
          ));
        
        blog[0].views = (blog[0].views || 0) + 1;
      }

      return NextResponse.json(blog[0], { status: 200 });
    }

    // List with pagination, search, and filters
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const authorId = searchParams.get('authorId');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');
    const sort = searchParams.get('sort') ?? 'publishedAt';
    const order = searchParams.get('order') ?? 'desc';

    let conditions = [eq(blogs.authorId, user.id)];

    // Search across title, excerpt, and content
    if (search) {
      conditions.push(
        or(
          like(blogs.title, `%${search}%`),
          like(blogs.excerpt, `%${search}%`),
          like(blogs.content, `%${search}%`)
        )
      );
    }

    // Filter by authorId
    if (authorId) {
      const authorIdInt = parseInt(authorId);
      if (!isNaN(authorIdInt)) {
        conditions.push(eq(blogs.authorId, authorIdInt));
      }
    }

    // Filter by category
    if (category) {
      conditions.push(eq(blogs.category, category));
    }

    // Filter by status
    if (status) {
      conditions.push(eq(blogs.status, status));
    }

    let query = db.select().from(blogs);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply sorting
    if (sort === 'publishedAt') {
      query = query.orderBy(order === 'asc' ? asc(blogs.publishedAt) : desc(blogs.publishedAt));
    } else if (sort === 'views') {
      query = query.orderBy(order === 'asc' ? asc(blogs.views) : desc(blogs.views));
    } else if (sort === 'createdAt') {
      query = query.orderBy(order === 'asc' ? asc(blogs.createdAt) : desc(blogs.createdAt));
    }

    let results = await query.limit(limit).offset(offset);

    // Filter by tag if specified (JSON array search)
    if (tag && results.length > 0) {
      results = results.filter(blog => {
        if (!blog.tags) return false;
        try {
          const tags = typeof blog.tags === 'string' ? JSON.parse(blog.tags) : blog.tags;
          return Array.isArray(tags) && tags.includes(tag);
        } catch {
          return false;
        }
      });
    }

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

    // Security check: reject if userId/authorId provided in body
    if ('userId' in body || 'user_id' in body || 'authorId' in body || 'author_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    const { title, slug, content, category, excerpt, featuredImage, tags, status } = body;

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json({ 
        error: "Title is required",
        code: "MISSING_TITLE" 
      }, { status: 400 });
    }

    if (!slug || !slug.trim()) {
      return NextResponse.json({ 
        error: "Slug is required",
        code: "MISSING_SLUG" 
      }, { status: 400 });
    }

    if (!content || !content.trim()) {
      return NextResponse.json({ 
        error: "Content is required",
        code: "MISSING_CONTENT" 
      }, { status: 400 });
    }

    if (!category || !category.trim()) {
      return NextResponse.json({ 
        error: "Category is required",
        code: "MISSING_CATEGORY" 
      }, { status: 400 });
    }

    // Validate slug is URL-friendly
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug.trim())) {
      return NextResponse.json({ 
        error: "Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)",
        code: "INVALID_SLUG_FORMAT" 
      }, { status: 400 });
    }

    // Check slug uniqueness
    const existingSlug = await db.select()
      .from(blogs)
      .where(eq(blogs.slug, slug.trim()))
      .limit(1);

    if (existingSlug.length > 0) {
      return NextResponse.json({ 
        error: "Slug already exists",
        code: "DUPLICATE_SLUG" 
      }, { status: 400 });
    }

    // Validate status enum
    const validStatuses = ['draft', 'published'];
    const blogStatus = status || 'draft';
    if (!validStatuses.includes(blogStatus)) {
      return NextResponse.json({ 
        error: "Status must be either 'draft' or 'published'",
        code: "INVALID_STATUS" 
      }, { status: 400 });
    }

    // Validate and parse tags as JSON array
    let parsedTags = null;
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (!Array.isArray(parsedTags)) {
          return NextResponse.json({ 
            error: "Tags must be a JSON array",
            code: "INVALID_TAGS_FORMAT" 
          }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ 
          error: "Tags must be valid JSON array",
          code: "INVALID_TAGS_JSON" 
        }, { status: 400 });
      }
    }

    // Verify user exists (authorId validation)
    const userExists = await db.select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json({ 
        error: "Invalid author ID",
        code: "INVALID_AUTHOR_ID" 
      }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Prepare insert data
    const insertData: any = {
      title: title.trim(),
      slug: slug.trim(),
      content: content.trim(),
      category: category.trim(),
      authorId: user.id,
      status: blogStatus,
      views: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (excerpt) insertData.excerpt = excerpt.trim();
    if (featuredImage) insertData.featuredImage = featuredImage.trim();
    if (parsedTags) insertData.tags = JSON.stringify(parsedTags);
    if (blogStatus === 'published') insertData.publishedAt = now;

    const newBlog = await db.insert(blogs)
      .values(insertData)
      .returning();

    return NextResponse.json(newBlog[0], { status: 201 });
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

    const blogId = parseInt(id);
    const body = await request.json();

    // Security check: reject if userId/authorId provided in body
    if ('userId' in body || 'user_id' in body || 'authorId' in body || 'author_id' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if blog exists and belongs to user
    const existingBlog = await db.select()
      .from(blogs)
      .where(and(
        eq(blogs.id, blogId),
        eq(blogs.authorId, user.id)
      ))
      .limit(1);

    if (existingBlog.length === 0) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    const { title, slug, content, category, excerpt, featuredImage, tags, status } = body;

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Validate and update title
    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ 
          error: "Title cannot be empty",
          code: "EMPTY_TITLE" 
        }, { status: 400 });
      }
      updates.title = title.trim();
    }

    // Validate and update slug
    if (slug !== undefined) {
      if (!slug.trim()) {
        return NextResponse.json({ 
          error: "Slug cannot be empty",
          code: "EMPTY_SLUG" 
        }, { status: 400 });
      }

      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(slug.trim())) {
        return NextResponse.json({ 
          error: "Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)",
          code: "INVALID_SLUG_FORMAT" 
        }, { status: 400 });
      }

      // Check slug uniqueness (excluding current blog)
      const existingSlug = await db.select()
        .from(blogs)
        .where(and(
          eq(blogs.slug, slug.trim()),
          sql`${blogs.id} != ${blogId}`
        ))
        .limit(1);

      if (existingSlug.length > 0) {
        return NextResponse.json({ 
          error: "Slug already exists",
          code: "DUPLICATE_SLUG" 
        }, { status: 400 });
      }

      updates.slug = slug.trim();
    }

    // Validate and update content
    if (content !== undefined) {
      if (!content.trim()) {
        return NextResponse.json({ 
          error: "Content cannot be empty",
          code: "EMPTY_CONTENT" 
        }, { status: 400 });
      }
      updates.content = content.trim();
    }

    // Validate and update category
    if (category !== undefined) {
      if (!category.trim()) {
        return NextResponse.json({ 
          error: "Category cannot be empty",
          code: "EMPTY_CATEGORY" 
        }, { status: 400 });
      }
      updates.category = category.trim();
    }

    // Update optional fields
    if (excerpt !== undefined) updates.excerpt = excerpt.trim();
    if (featuredImage !== undefined) updates.featuredImage = featuredImage.trim();

    // Validate and update tags
    if (tags !== undefined) {
      try {
        const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (!Array.isArray(parsedTags)) {
          return NextResponse.json({ 
            error: "Tags must be a JSON array",
            code: "INVALID_TAGS_FORMAT" 
          }, { status: 400 });
        }
        updates.tags = JSON.stringify(parsedTags);
      } catch {
        return NextResponse.json({ 
          error: "Tags must be valid JSON array",
          code: "INVALID_TAGS_JSON" 
        }, { status: 400 });
      }
    }

    // Validate and update status
    if (status !== undefined) {
      const validStatuses = ['draft', 'published'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ 
          error: "Status must be either 'draft' or 'published'",
          code: "INVALID_STATUS" 
        }, { status: 400 });
      }

      updates.status = status;

      // Set publishedAt when status changes to published
      if (status === 'published' && existingBlog[0].status !== 'published') {
        updates.publishedAt = new Date().toISOString();
      }
    }

    const updatedBlog = await db.update(blogs)
      .set(updates)
      .where(and(
        eq(blogs.id, blogId),
        eq(blogs.authorId, user.id)
      ))
      .returning();

    if (updatedBlog.length === 0) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    return NextResponse.json(updatedBlog[0], { status: 200 });
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

    const blogId = parseInt(id);

    // Check if blog exists and belongs to user
    const existingBlog = await db.select()
      .from(blogs)
      .where(and(
        eq(blogs.id, blogId),
        eq(blogs.authorId, user.id)
      ))
      .limit(1);

    if (existingBlog.length === 0) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    const deleted = await db.delete(blogs)
      .where(and(
        eq(blogs.id, blogId),
        eq(blogs.authorId, user.id)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Blog deleted successfully',
      blog: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}