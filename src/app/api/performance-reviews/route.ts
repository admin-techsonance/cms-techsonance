import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { performanceReviews, employees, users } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Single performance review by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json(
          { error: 'Valid ID is required', code: 'INVALID_ID' },
          { status: 400 }
        );
      }

      const review = await db
        .select()
        .from(performanceReviews)
        .where(eq(performanceReviews.id, parseInt(id)))
        .limit(1);

      if (review.length === 0) {
        return NextResponse.json(
          { error: 'Performance review not found', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      return NextResponse.json(review[0], { status: 200 });
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const employeeId = searchParams.get('employeeId');
    const reviewerId = searchParams.get('reviewerId');
    const rating = searchParams.get('rating');
    const reviewPeriod = searchParams.get('reviewPeriod');

    let query = db.select().from(performanceReviews);

    // Build filter conditions
    const conditions = [];

    if (employeeId) {
      const empId = parseInt(employeeId);
      if (!isNaN(empId)) {
        conditions.push(eq(performanceReviews.employeeId, empId));
      }
    }

    if (reviewerId) {
      const revId = parseInt(reviewerId);
      if (!isNaN(revId)) {
        conditions.push(eq(performanceReviews.reviewerId, revId));
      }
    }

    if (rating) {
      const ratingNum = parseInt(rating);
      if (!isNaN(ratingNum) && ratingNum >= 1 && ratingNum <= 5) {
        conditions.push(eq(performanceReviews.rating, ratingNum));
      }
    }

    if (reviewPeriod) {
      conditions.push(eq(performanceReviews.reviewPeriod, reviewPeriod));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query
      .orderBy(desc(performanceReviews.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, reviewerId, rating, reviewPeriod, comments } = body;

    // Validate required fields
    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required', code: 'MISSING_EMPLOYEE_ID' },
        { status: 400 }
      );
    }

    if (!reviewerId) {
      return NextResponse.json(
        { error: 'Reviewer ID is required', code: 'MISSING_REVIEWER_ID' },
        { status: 400 }
      );
    }

    if (!rating) {
      return NextResponse.json(
        { error: 'Rating is required', code: 'MISSING_RATING' },
        { status: 400 }
      );
    }

    if (!reviewPeriod || reviewPeriod.trim() === '') {
      return NextResponse.json(
        { error: 'Review period is required', code: 'MISSING_REVIEW_PERIOD' },
        { status: 400 }
      );
    }

    // Validate rating range
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5', code: 'INVALID_RATING' },
        { status: 400 }
      );
    }

    // Validate employeeId exists
    const employee = await db
      .select()
      .from(employees)
      .where(eq(employees.id, parseInt(employeeId)))
      .limit(1);

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found', code: 'EMPLOYEE_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Validate reviewerId exists
    const reviewer = await db
      .select()
      .from(users)
      .where(eq(users.id, parseInt(reviewerId)))
      .limit(1);

    if (reviewer.length === 0) {
      return NextResponse.json(
        { error: 'Reviewer not found', code: 'REVIEWER_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Create new performance review
    const newReview = await db
      .insert(performanceReviews)
      .values({
        employeeId: parseInt(employeeId),
        reviewerId: parseInt(reviewerId),
        rating: ratingNum,
        reviewPeriod: reviewPeriod.trim(),
        comments: comments?.trim() || null,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newReview[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // Check if performance review exists
    const existing = await db
      .select()
      .from(performanceReviews)
      .where(eq(performanceReviews.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Performance review not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { rating, reviewPeriod, comments } = body;

    const updates: any = {};

    // Validate and add rating if provided
    if (rating !== undefined) {
      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 5', code: 'INVALID_RATING' },
          { status: 400 }
        );
      }
      updates.rating = ratingNum;
    }

    // Validate and add reviewPeriod if provided
    if (reviewPeriod !== undefined) {
      if (reviewPeriod.trim() === '') {
        return NextResponse.json(
          {
            error: 'Review period cannot be empty',
            code: 'INVALID_REVIEW_PERIOD',
          },
          { status: 400 }
        );
      }
      updates.reviewPeriod = reviewPeriod.trim();
    }

    // Add comments if provided
    if (comments !== undefined) {
      updates.comments = comments?.trim() || null;
    }

    // If no valid updates, return error
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update', code: 'NO_UPDATES' },
        { status: 400 }
      );
    }

    // Perform update
    const updated = await db
      .update(performanceReviews)
      .set(updates)
      .where(eq(performanceReviews.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // Check if performance review exists
    const existing = await db
      .select()
      .from(performanceReviews)
      .where(eq(performanceReviews.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Performance review not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Delete the performance review
    const deleted = await db
      .delete(performanceReviews)
      .where(eq(performanceReviews.id, parseInt(id)))
      .returning();

    return NextResponse.json(
      {
        message: 'Performance review deleted successfully',
        review: deleted[0],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}