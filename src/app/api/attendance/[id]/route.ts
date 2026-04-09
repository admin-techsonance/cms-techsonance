import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords } from '@/db/schema';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, NotFoundError } from '@/server/http/errors';
import { updateAttendanceRecordSchema } from '@/server/validation/attendance-admin';

function calculateDuration(dateStr: string, timeIn: string, timeOut: string | null) {
  if (!timeIn || !timeOut) return null;
  try {
    const inDate = new Date(`${dateStr}T${timeIn}`);
    const outDate = new Date(`${dateStr}T${timeOut}`);
    const diff = Math.round((outDate.getTime() - inDate.getTime()) / 60000);
    return diff > 0 ? diff : 0;
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authenticateRequest(request, { required: true, roles: ['Admin'] });
    const { id } = await params;
    const recordId = Number(id);
    if (!Number.isInteger(recordId) || recordId <= 0) throw new BadRequestError('Valid attendance record id is required');

    const payload = updateAttendanceRecordSchema.parse(await request.json());
    const duration = payload.timeOut ? calculateDuration(payload.date, payload.timeIn, payload.timeOut) : null;

    if (payload._source === 'legacy') {
      const [existing] = await db.select().from(attendance).where(eq(attendance.id, recordId)).limit(1);
      if (!existing) throw new NotFoundError('Legacy attendance record not found');

      await db.update(attendance).set({
        checkIn: payload.timeIn,
        checkOut: payload.timeOut ?? null,
        status: payload.status,
      }).where(eq(attendance.id, recordId));
    } else {
      const [existing] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
      if (!existing) throw new NotFoundError('Attendance record not found');

      await db.update(attendanceRecords).set({
        timeIn: payload.timeIn,
        timeOut: payload.timeOut ?? null,
        duration,
        status: payload.status,
      }).where(eq(attendanceRecords.id, recordId));
    }

    return apiSuccess(null, 'Attendance record updated successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
