import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { inquiries } from '@/db/schema';
import { eq, like, and, or, desc, gte, lte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

const TAG_ENUM = [
  'need_estimation',
  'rough_estimation',
  'scheduling_meeting',
  'need_schedule_meeting',
  'hired_someone_else',
  'hired'
] as const;

const STATUS_ENUM = [
  'lead',
  'no_reply',
  'follow_up',
  'hired',
  'rejected_client',
  'rejected_us',
  'invite_lead',
  'invite_hire',
  'not_good_client',
  'budget_low',
  'cant_work',
  'hired_someone_else'
] as const;

const APP_STATUS_ENUM = ['open', 'close'] as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (id) {
      if (!id || isNaN(parseInt(id))) {
        return NextResponse.json(
          { error: 'Valid ID is required', code: 'INVALID_ID' },
          { status: 400 }
        );
      }

      const inquiry = await db
        .select()
        .from(inquiries)
        .where(eq(inquiries.id, parseInt(id)))
        .limit(1);

      if (inquiry.length === 0) {
        return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
      }

      return NextResponse.json(inquiry[0], { status: 200 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');
    const status = searchParams.get('status');
    const appStatus = searchParams.get('appStatus');
    const isFavourite = searchParams.get('isFavourite');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const conditions = [];

    if (search) {
      conditions.push(like(inquiries.aliasName, `%${search}%`));
    }

    if (tag) {
      conditions.push(eq(inquiries.tag, tag));
    }

    if (status) {
      conditions.push(eq(inquiries.status, status));
    }

    if (appStatus) {
      conditions.push(eq(inquiries.appStatus, appStatus));
    }

    if (isFavourite !== null && isFavourite !== undefined) {
      const favValue = isFavourite === 'true' || isFavourite === '1';
      conditions.push(eq(inquiries.isFavourite, favValue));
    }

    if (startDate) {
      conditions.push(gte(inquiries.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(inquiries.createdAt, endDate));
    }

    let query = db.select().from(inquiries);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query
      .orderBy(desc(inquiries.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();

    if ('createdBy' in body || 'created_by' in body) {
      return NextResponse.json(
        {
          error: 'User ID cannot be provided in request body',
          code: 'USER_ID_NOT_ALLOWED'
        },
        { status: 400 }
      );
    }

    const { aliasName, tag, status, dueDate, appStatus, isFavourite } = body;

    if (!aliasName || typeof aliasName !== 'string' || aliasName.trim() === '') {
      return NextResponse.json(
        { error: 'aliasName is required and must be a non-empty string', code: 'MISSING_ALIAS_NAME' },
        { status: 400 }
      );
    }

    if (!tag || !TAG_ENUM.includes(tag)) {
      return NextResponse.json(
        {
          error: `tag is required and must be one of: ${TAG_ENUM.join(', ')}`,
          code: 'INVALID_TAG',
          validValues: TAG_ENUM
        },
        { status: 400 }
      );
    }

    if (!status || !STATUS_ENUM.includes(status)) {
      return NextResponse.json(
        {
          error: `status is required and must be one of: ${STATUS_ENUM.join(', ')}`,
          code: 'INVALID_STATUS',
          validValues: STATUS_ENUM
        },
        { status: 400 }
      );
    }

    if (appStatus && !APP_STATUS_ENUM.includes(appStatus)) {
      return NextResponse.json(
        {
          error: `appStatus must be one of: ${APP_STATUS_ENUM.join(', ')}`,
          code: 'INVALID_APP_STATUS',
          validValues: APP_STATUS_ENUM
        },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    const newInquiry = await db
      .insert(inquiries)
      .values({
        aliasName: aliasName.trim(),
        tag,
        status,
        dueDate: dueDate || null,
        appStatus: appStatus || null,
        isFavourite: isFavourite !== undefined ? Boolean(isFavourite) : false,
        createdBy: user.id,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning();

    return NextResponse.json(newInquiry[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    if ('createdBy' in body || 'created_by' in body) {
      return NextResponse.json(
        {
          error: 'User ID cannot be provided in request body',
          code: 'USER_ID_NOT_ALLOWED'
        },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    const { aliasName, tag, status, dueDate, appStatus, isFavourite } = body;

    if (aliasName !== undefined && (typeof aliasName !== 'string' || aliasName.trim() === '')) {
      return NextResponse.json(
        { error: 'aliasName must be a non-empty string', code: 'INVALID_ALIAS_NAME' },
        { status: 400 }
      );
    }

    if (tag !== undefined && !TAG_ENUM.includes(tag)) {
      return NextResponse.json(
        {
          error: `tag must be one of: ${TAG_ENUM.join(', ')}`,
          code: 'INVALID_TAG',
          validValues: TAG_ENUM
        },
        { status: 400 }
      );
    }

    if (status !== undefined && !STATUS_ENUM.includes(status)) {
      return NextResponse.json(
        {
          error: `status must be one of: ${STATUS_ENUM.join(', ')}`,
          code: 'INVALID_STATUS',
          validValues: STATUS_ENUM
        },
        { status: 400 }
      );
    }

    if (appStatus !== undefined && appStatus !== null && !APP_STATUS_ENUM.includes(appStatus)) {
      return NextResponse.json(
        {
          error: `appStatus must be one of: ${APP_STATUS_ENUM.join(', ')}`,
          code: 'INVALID_APP_STATUS',
          validValues: APP_STATUS_ENUM
        },
        { status: 400 }
      );
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (aliasName !== undefined) updates.aliasName = aliasName.trim();
    if (tag !== undefined) updates.tag = tag;
    if (status !== undefined) updates.status = status;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (appStatus !== undefined) updates.appStatus = appStatus;
    if (isFavourite !== undefined) updates.isFavourite = Boolean(isFavourite);

    const updated = await db
      .update(inquiries)
      .set(updates)
      .where(eq(inquiries.id, parseInt(id)))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json(
        { error: 'Valid ID is required', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const existing = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    const deleted = await db
      .update(inquiries)
      .set({
        appStatus: 'close',
        updatedAt: new Date().toISOString()
      })
      .where(eq(inquiries.id, parseInt(id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Inquiry not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Inquiry soft deleted successfully',
        inquiry: deleted[0]
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 500 }
    );
  }
}