import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { inquiryFeeds, inquiries } from '@/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single record by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const feed = await db.select()
        .from(inquiryFeeds)
        .where(eq(inquiryFeeds.id, parseInt(id)))
        .limit(1);

      if (feed.length === 0) {
        return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
      }

      return NextResponse.json(feed[0], { status: 200 });
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const inquiryId = searchParams.get('inquiryId');

    let query = db.select().from(inquiryFeeds);

    // Filter by inquiryId if provided
    if (inquiryId) {
      if (isNaN(parseInt(inquiryId))) {
        return NextResponse.json({ 
          error: 'Valid inquiryId is required',
          code: 'INVALID_INQUIRY_ID' 
        }, { status: 400 });
      }
      query = query.where(eq(inquiryFeeds.inquiryId, parseInt(inquiryId)));
    }

    // Sort by createdAt ASC (chronological order)
    const results = await query
      .orderBy(asc(inquiryFeeds.createdAt))
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
    const { inquiryId, technology, description } = body;

    // Security check: reject if commentedBy provided in body
    if ('commentedBy' in body || 'commented_by' in body) {
      return NextResponse.json({ 
        error: "commentedBy cannot be provided in request body",
        code: "COMMENTED_BY_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Validate required fields
    if (!inquiryId) {
      return NextResponse.json({ 
        error: "inquiryId is required",
        code: "MISSING_INQUIRY_ID" 
      }, { status: 400 });
    }

    if (!description || description.trim() === '') {
      return NextResponse.json({ 
        error: "description is required",
        code: "MISSING_DESCRIPTION" 
      }, { status: 400 });
    }

    // Validate inquiryId is a valid number
    if (isNaN(parseInt(inquiryId))) {
      return NextResponse.json({ 
        error: "Valid inquiryId is required",
        code: "INVALID_INQUIRY_ID" 
      }, { status: 400 });
    }

    // Validate that inquiryId exists in inquiries table
    const inquiry = await db.select()
      .from(inquiries)
      .where(eq(inquiries.id, parseInt(inquiryId)))
      .limit(1);

    if (inquiry.length === 0) {
      return NextResponse.json({ 
        error: "Inquiry not found",
        code: "INQUIRY_NOT_FOUND" 
      }, { status: 404 });
    }

    // Create new feed with auto-generated fields
    const newFeed = await db.insert(inquiryFeeds)
      .values({
        inquiryId: parseInt(inquiryId),
        commentedBy: user.id,
        technology: technology?.trim() || null,
        description: description.trim(),
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newFeed[0], { status: 201 });
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
    const { technology, description } = body;

    // Security check: reject if commentedBy or inquiryId provided in body
    if ('commentedBy' in body || 'commented_by' in body) {
      return NextResponse.json({ 
        error: "commentedBy cannot be provided in request body",
        code: "COMMENTED_BY_NOT_ALLOWED" 
      }, { status: 400 });
    }

    if ('inquiryId' in body || 'inquiry_id' in body) {
      return NextResponse.json({ 
        error: "inquiryId cannot be modified",
        code: "INQUIRY_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }

    // Check if feed exists and belongs to the authenticated user
    const existingFeed = await db.select()
      .from(inquiryFeeds)
      .where(and(
        eq(inquiryFeeds.id, parseInt(id)),
        eq(inquiryFeeds.commentedBy, user.id)
      ))
      .limit(1);

    if (existingFeed.length === 0) {
      return NextResponse.json({ 
        error: 'Feed not found or you do not have permission to update it',
        code: 'FEED_NOT_FOUND_OR_UNAUTHORIZED'
      }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};

    if (technology !== undefined) {
      updateData.technology = technology?.trim() || null;
    }

    if (description !== undefined) {
      if (description.trim() === '') {
        return NextResponse.json({ 
          error: "description cannot be empty",
          code: "INVALID_DESCRIPTION" 
        }, { status: 400 });
      }
      updateData.description = description.trim();
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update",
        code: "NO_UPDATE_FIELDS" 
      }, { status: 400 });
    }

    // Update the feed
    const updated = await db.update(inquiryFeeds)
      .set(updateData)
      .where(and(
        eq(inquiryFeeds.id, parseInt(id)),
        eq(inquiryFeeds.commentedBy, user.id)
      ))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update feed',
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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if feed exists and belongs to the authenticated user
    const existingFeed = await db.select()
      .from(inquiryFeeds)
      .where(and(
        eq(inquiryFeeds.id, parseInt(id)),
        eq(inquiryFeeds.commentedBy, user.id)
      ))
      .limit(1);

    if (existingFeed.length === 0) {
      return NextResponse.json({ 
        error: 'Feed not found or you do not have permission to delete it',
        code: 'FEED_NOT_FOUND_OR_UNAUTHORIZED'
      }, { status: 404 });
    }

    // Delete the feed
    const deleted = await db.delete(inquiryFeeds)
      .where(and(
        eq(inquiryFeeds.id, parseInt(id)),
        eq(inquiryFeeds.commentedBy, user.id)
      ))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to delete feed',
        code: 'DELETE_FAILED'
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Feed deleted successfully',
      deleted: deleted[0]
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}