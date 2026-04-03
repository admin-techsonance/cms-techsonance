import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { companyHolidays } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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

    // Single record by ID
    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json({ 
          error: 'Valid ID is required',
          code: 'INVALID_ID' 
        }, { status: 400 });
      }

      const record = await db.select()
        .from(companyHolidays)
        .where(eq(companyHolidays.id, parseInt(id)))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ 
          error: 'Company holiday not found',
          code: 'NOT_FOUND' 
        }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with pagination and filtering
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const year = searchParams.get('year');

    let query = db.select().from(companyHolidays);

    // Filter by year if provided
    if (year) {
      const yearInt = parseInt(year);
      if (isNaN(yearInt)) {
        return NextResponse.json({ 
          error: 'Invalid year format',
          code: 'INVALID_YEAR' 
        }, { status: 400 });
      }
      query = query.where(eq(companyHolidays.year, yearInt));
    }

    // Sort by date ascending
    const results = await query
      .orderBy(companyHolidays.date)
      .limit(limit)
      .offset(offset);

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
    const { date, reason, year } = body;

    // Validate required fields
    if (!date) {
      return NextResponse.json({ 
        error: 'Date is required',
        code: 'MISSING_DATE' 
      }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json({ 
        error: 'Reason is required',
        code: 'MISSING_REASON' 
      }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ 
        error: 'Invalid date format. Expected YYYY-MM-DD',
        code: 'INVALID_DATE_FORMAT' 
      }, { status: 400 });
    }

    // Validate date is a valid date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ 
        error: 'Invalid date value',
        code: 'INVALID_DATE_VALUE' 
      }, { status: 400 });
    }

    // Auto-extract year from date if not provided
    let holidayYear = year;
    if (!holidayYear) {
      holidayYear = parsedDate.getFullYear();
    } else {
      // Validate year if provided
      const yearInt = parseInt(holidayYear);
      if (isNaN(yearInt) || yearInt < 1000 || yearInt > 9999) {
        return NextResponse.json({ 
          error: 'Invalid year. Must be a 4-digit integer',
          code: 'INVALID_YEAR' 
        }, { status: 400 });
      }
      holidayYear = yearInt;
    }

    // Check for duplicate date
    const existingHoliday = await db.select()
      .from(companyHolidays)
      .where(eq(companyHolidays.date, date))
      .limit(1);

    if (existingHoliday.length > 0) {
      return NextResponse.json({ 
        error: 'A holiday with this date already exists',
        code: 'DUPLICATE_DATE' 
      }, { status: 400 });
    }

    // Create new holiday
    const newHoliday = await db.insert(companyHolidays)
      .values({
        date: date.trim(),
        reason: reason.trim(),
        year: holidayYear,
        createdAt: new Date().toISOString()
      })
      .returning();

    return NextResponse.json(newHoliday[0], { status: 201 });

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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(companyHolidays)
      .where(eq(companyHolidays.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Company holiday not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    const body = await request.json();
    const { date, reason, year } = body;

    const updates: any = {};

    // Validate and update date if provided
    if (date !== undefined) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return NextResponse.json({ 
          error: 'Invalid date format. Expected YYYY-MM-DD',
          code: 'INVALID_DATE_FORMAT' 
        }, { status: 400 });
      }

      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ 
          error: 'Invalid date value',
          code: 'INVALID_DATE_VALUE' 
        }, { status: 400 });
      }

      // Check for duplicate date (excluding current record)
      const duplicateCheck = await db.select()
        .from(companyHolidays)
        .where(and(
          eq(companyHolidays.date, date),
        ))
        .limit(1);

      if (duplicateCheck.length > 0 && duplicateCheck[0].id !== parseInt(id)) {
        return NextResponse.json({ 
          error: 'A holiday with this date already exists',
          code: 'DUPLICATE_DATE' 
        }, { status: 400 });
      }

      updates.date = date.trim();
      
      // Auto-update year based on new date
      updates.year = parsedDate.getFullYear();
    }

    // Validate and update reason if provided
    if (reason !== undefined) {
      if (!reason.trim()) {
        return NextResponse.json({ 
          error: 'Reason cannot be empty',
          code: 'INVALID_REASON' 
        }, { status: 400 });
      }
      updates.reason = reason.trim();
    }

    // Validate and update year if explicitly provided (overrides auto-extracted year)
    if (year !== undefined) {
      const yearInt = parseInt(year);
      if (isNaN(yearInt) || yearInt < 1000 || yearInt > 9999) {
        return NextResponse.json({ 
          error: 'Invalid year. Must be a 4-digit integer',
          code: 'INVALID_YEAR' 
        }, { status: 400 });
      }
      updates.year = yearInt;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ 
        error: 'No valid fields to update',
        code: 'NO_UPDATES' 
      }, { status: 400 });
    }

    // Perform update
    const updated = await db.update(companyHolidays)
      .set(updates)
      .where(eq(companyHolidays.id, parseInt(id)))
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
        error: 'Valid ID is required',
        code: 'INVALID_ID' 
      }, { status: 400 });
    }

    // Check if record exists
    const existing = await db.select()
      .from(companyHolidays)
      .where(eq(companyHolidays.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Company holiday not found',
        code: 'NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete the record
    const deleted = await db.delete(companyHolidays)
      .where(eq(companyHolidays.id, parseInt(id)))
      .returning();

    return NextResponse.json({
      message: 'Company holiday deleted successfully',
      data: deleted[0]
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}