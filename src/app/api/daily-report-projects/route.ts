import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { dailyReportProjects, dailyReports, projects, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

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

      const record = await db.select({
        id: dailyReportProjects.id,
        dailyReportId: dailyReportProjects.dailyReportId,
        projectId: dailyReportProjects.projectId,
        description: dailyReportProjects.description,
        trackerTime: dailyReportProjects.trackerTime,
        isCoveredWork: dailyReportProjects.isCoveredWork,
        isExtraWork: dailyReportProjects.isExtraWork,
        createdAt: dailyReportProjects.createdAt,
      })
        .from(dailyReportProjects)
        .innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id))
        .where(and(
          eq(dailyReportProjects.id, parseInt(id)),
          eq(dailyReports.userId, user.id)
        ))
        .limit(1);

      if (record.length === 0) {
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      }

      return NextResponse.json(record[0], { status: 200 });
    }

    // List with filters and pagination
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10'), 100);
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const dailyReportId = searchParams.get('dailyReportId');
    const projectId = searchParams.get('projectId');
    const isCoveredWork = searchParams.get('isCoveredWork');
    const isExtraWork = searchParams.get('isExtraWork');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let conditions = [];
    if (!hasFullAccess(user.role as UserRole)) {
      conditions.push(eq(dailyReports.userId, user.id));
    }

    if (dailyReportId) {
      conditions.push(eq(dailyReportProjects.dailyReportId, parseInt(dailyReportId)));
    }

    if (projectId) {
      conditions.push(eq(dailyReportProjects.projectId, parseInt(projectId)));
    }

    if (isCoveredWork !== null && isCoveredWork !== undefined && isCoveredWork !== '') {
      const boolValue = isCoveredWork === 'true' || isCoveredWork === '1';
      conditions.push(eq(dailyReportProjects.isCoveredWork, boolValue));
    }

    if (isExtraWork !== null && isExtraWork !== undefined && isExtraWork !== '') {
      const boolValue = isExtraWork === 'true' || isExtraWork === '1';
      conditions.push(eq(dailyReportProjects.isExtraWork, boolValue));
    }

    if (startDate) {
      conditions.push(gte(dailyReports.date, startDate));
    }

    if (endDate) {
      conditions.push(lte(dailyReports.date, endDate));
    }

    const results = await db.select({
      id: dailyReportProjects.id,
      dailyReportId: dailyReportProjects.dailyReportId,
      projectId: dailyReportProjects.projectId,
      description: dailyReportProjects.description,
      trackerTime: dailyReportProjects.trackerTime,
      isCoveredWork: dailyReportProjects.isCoveredWork,
      isExtraWork: dailyReportProjects.isExtraWork,
      createdAt: dailyReportProjects.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(dailyReportProjects)
      .innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id))
      .innerJoin(users, eq(dailyReports.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(dailyReportProjects.createdAt))
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
    const { dailyReportId, projectId, description, trackerTime, isCoveredWork, isExtraWork } = body;

    // Validate required fields
    if (!dailyReportId) {
      return NextResponse.json({ 
        error: 'Daily report ID is required',
        code: 'MISSING_DAILY_REPORT_ID' 
      }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ 
        error: 'Project ID is required',
        code: 'MISSING_PROJECT_ID' 
      }, { status: 400 });
    }

    if (!description || description.trim() === '') {
      return NextResponse.json({ 
        error: 'Description is required',
        code: 'MISSING_DESCRIPTION' 
      }, { status: 400 });
    }

    if (trackerTime === undefined || trackerTime === null) {
      return NextResponse.json({ 
        error: 'Tracker time is required',
        code: 'MISSING_TRACKER_TIME' 
      }, { status: 400 });
    }

    // Validate trackerTime is positive integer
    const trackerTimeInt = parseInt(trackerTime);
    if (isNaN(trackerTimeInt) || trackerTimeInt <= 0) {
      return NextResponse.json({ 
        error: 'Tracker time must be a positive integer (minutes)',
        code: 'INVALID_TRACKER_TIME' 
      }, { status: 400 });
    }

    // Validate dailyReportId exists and belongs to user
    const dailyReport = await db.select()
      .from(dailyReports)
      .where(and(
        eq(dailyReports.id, parseInt(dailyReportId)),
        eq(dailyReports.userId, user.id)
      ))
      .limit(1);

    if (dailyReport.length === 0) {
      return NextResponse.json({ 
        error: 'Daily report not found or access denied',
        code: 'DAILY_REPORT_NOT_FOUND' 
      }, { status: 404 });
    }

    // Validate projectId exists
    const project = await db.select()
      .from(projects)
      .where(eq(projects.id, parseInt(projectId)))
      .limit(1);

    if (project.length === 0) {
      return NextResponse.json({ 
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND' 
      }, { status: 404 });
    }

    // Create new daily report project
    const newRecord = await db.insert(dailyReportProjects)
      .values({
        dailyReportId: parseInt(dailyReportId),
        projectId: parseInt(projectId),
        description: description.trim(),
        trackerTime: trackerTimeInt,
        isCoveredWork: isCoveredWork ?? false,
        isExtraWork: isExtraWork ?? false,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return NextResponse.json(newRecord[0], { status: 201 });
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

    const body = await request.json();
    const { projectId, description, trackerTime, isCoveredWork, isExtraWork } = body;

    // Check if record exists and belongs to user
    const existingRecord = await db.select({
      id: dailyReportProjects.id,
      dailyReportId: dailyReportProjects.dailyReportId,
    })
      .from(dailyReportProjects)
      .innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id))
      .where(and(
        eq(dailyReportProjects.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json({ 
        error: 'Record not found or access denied',
        code: 'RECORD_NOT_FOUND' 
      }, { status: 404 });
    }

    // Validate projectId if provided
    if (projectId !== undefined) {
      const project = await db.select()
        .from(projects)
        .where(eq(projects.id, parseInt(projectId)))
        .limit(1);

      if (project.length === 0) {
        return NextResponse.json({ 
          error: 'Project not found',
          code: 'PROJECT_NOT_FOUND' 
        }, { status: 404 });
      }
    }

    // Validate trackerTime if provided
    if (trackerTime !== undefined && trackerTime !== null) {
      const trackerTimeInt = parseInt(trackerTime);
      if (isNaN(trackerTimeInt) || trackerTimeInt <= 0) {
        return NextResponse.json({ 
          error: 'Tracker time must be a positive integer (minutes)',
          code: 'INVALID_TRACKER_TIME' 
        }, { status: 400 });
      }
    }

    // Build update object with only provided fields
    const updates: any = {};

    if (projectId !== undefined) {
      updates.projectId = parseInt(projectId);
    }

    if (description !== undefined) {
      if (description.trim() === '') {
        return NextResponse.json({ 
          error: 'Description cannot be empty',
          code: 'INVALID_DESCRIPTION' 
        }, { status: 400 });
      }
      updates.description = description.trim();
    }

    if (trackerTime !== undefined && trackerTime !== null) {
      updates.trackerTime = parseInt(trackerTime);
    }

    if (isCoveredWork !== undefined) {
      updates.isCoveredWork = isCoveredWork;
    }

    if (isExtraWork !== undefined) {
      updates.isExtraWork = isExtraWork;
    }

    // Perform update
    const updated = await db.update(dailyReportProjects)
      .set(updates)
      .where(eq(dailyReportProjects.id, parseInt(id)))
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

    // Check if record exists and belongs to user
    const existingRecord = await db.select({
      id: dailyReportProjects.id,
    })
      .from(dailyReportProjects)
      .innerJoin(dailyReports, eq(dailyReportProjects.dailyReportId, dailyReports.id))
      .where(and(
        eq(dailyReportProjects.id, parseInt(id)),
        eq(dailyReports.userId, user.id)
      ))
      .limit(1);

    if (existingRecord.length === 0) {
      return NextResponse.json({ 
        error: 'Record not found or access denied',
        code: 'RECORD_NOT_FOUND' 
      }, { status: 404 });
    }

    // Delete the record
    const deleted = await db.delete(dailyReportProjects)
      .where(eq(dailyReportProjects.id, parseInt(id)))
      .returning();

    return NextResponse.json({ 
      message: 'Daily report project deleted successfully',
      record: deleted[0] 
    }, { status: 200 });
  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({ 
      error: safeErrorMessage(error) 
    }, { status: 500 });
  }
}