import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';

// Helper to calculate duration in minutes
function calculateDuration(dateStr: string, timeIn: string, timeOut: string | null): number | null {
  if (!timeIn || !timeOut || !dateStr) return null;
  try {
    const inDate = new Date(`${dateStr}T${timeIn}`);
    const outDate = new Date(`${dateStr}T${timeOut}`);
    const diffMs = outDate.getTime() - inDate.getTime();
    const diffMins = Math.round(diffMs / 60000);
    return diffMins > 0 ? diffMins : 0;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
        { status: 401 }
      );
    }

    // Role check: Only admin/HR can edit
    if (!hasFullAccess(currentUser.role as UserRole)) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions to edit attendance records',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const recordId = parseInt(id);

    if (isNaN(recordId)) {
      return NextResponse.json(
        { error: 'Invalid record ID', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { timeIn, timeOut, status, _source, date } = body;

    if (!timeIn || !status || !_source || !date) {
      return NextResponse.json(
        { error: 'Missing required fields (timeIn, status, _source, date)', code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    let updatedDuration: number | null = null;
    if (timeIn && timeOut) {
      updatedDuration = calculateDuration(date, timeIn, timeOut);
    }

    if (_source === 'legacy') {
      // Update legacy attendance table
      const legacyRecord = await db.select().from(attendance).where(eq(attendance.id, recordId)).limit(1);
      
      if (legacyRecord.length === 0) {
        return NextResponse.json({ error: 'Legacy record not found', code: 'NOT_FOUND' }, { status: 404 });
      }

      const updatePayload: any = {
        checkIn: timeIn,
        checkOut: timeOut || null,
        status: status,
      };

      await db.update(attendance)
        .set(updatePayload)
        .where(eq(attendance.id, recordId));
        
    } else {
      // Update new NFC attendanceRecords table
      const nfcRecord = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
      
      if (nfcRecord.length === 0) {
        return NextResponse.json({ error: 'NFC record not found', code: 'NOT_FOUND' }, { status: 404 });
      }

      const updatePayload: any = {
        timeIn: timeIn,
        timeOut: timeOut || null,
        duration: updatedDuration,
        status: status,
      };

      await db.update(attendanceRecords)
        .set(updatePayload)
        .where(eq(attendanceRecords.id, recordId));
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Attendance record updated successfully',
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('PATCH attendance edit error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + (error as Error).message,
        code: 'INTERNAL_SERVER_ERROR',
      },
      { status: 500 }
    );
  }
}
