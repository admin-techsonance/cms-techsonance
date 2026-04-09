import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags } from '@/db/schema';
import { env } from '@/server/config/env';
import { ApiError, BadRequestError, UnauthorizedError } from '@/server/http/errors';
import { apiError, apiSuccess } from '@/server/http/response';
import { logger } from '@/server/logging/logger';
import { firebaseSyncBodySchema } from '@/server/validation/firebase';

function formatToISO(dateStr: string, timeStr: string) {
  if (!dateStr || !timeStr) return null;
  try {
    if (timeStr.includes('T')) return timeStr;
    let time = timeStr.trim();
    const match = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
    if (match) {
      let hours = Number(match[1]);
      const minutes = match[2];
      const seconds = match[3] || '00';
      const ampm = match[4].toLowerCase();
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      time = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }
    const parts = time.split(':');
    if (parts.length === 2) time = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
    return `${dateStr}T${time}`;
  } catch {
    return null;
  }
}

function calculateDuration(dateStr: string, timeIn: string, timeOut: string) {
  const isoIn = formatToISO(dateStr, timeIn);
  const isoOut = formatToISO(dateStr, timeOut);
  if (!isoIn || !isoOut) return null;
  const diffMins = Math.round((new Date(isoOut).getTime() - new Date(isoIn).getTime()) / 60000);
  return diffMins > 0 ? diffMins : 0;
}

async function resolveEmployeeId(tagUid: string, entry: Record<string, unknown>) {
  const normalizedUid = tagUid.replace(/[:\s]/g, '').toLowerCase();
  const [allEmployees, allTags] = await Promise.all([
    db.select().from(employees),
    db.select().from(nfcTags),
  ]);

  const matchingTag = allTags.find((tag) => tag.tagUid.replace(/[:\s]/g, '').toLowerCase() === normalizedUid);
  if (matchingTag?.employeeId) return matchingTag.employeeId;

  const inlineEmployeeId = entry.employee_id ?? entry.employeeId ?? entry.emp_id;
  if (inlineEmployeeId !== undefined) {
    const match = allEmployees.find((employee) => String(employee.id) === String(inlineEmployeeId) || employee.employeeId === String(inlineEmployeeId));
    if (match) return match.id;
  }

  const employeeMatch = allEmployees.find((employee) =>
    String(employee.id) === normalizedUid ||
    employee.nfcCardId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid ||
    employee.employeeId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid
  );
  return employeeMatch?.id ?? null;
}

async function processAttendanceRecord(tagUid: string, dateKey: string, entry: Record<string, unknown>) {
  if (typeof entry.check_in !== 'string') {
    return { success: false, error: 'Invalid data' };
  }

  const logKey = `${tagUid}_${dateKey}_${entry.check_in}`;
  try {
    const employeeId = await resolveEmployeeId(tagUid, entry);
    if (!employeeId) {
      return { success: false, error: `Unknown Tag UID or Employee ID: ${tagUid}`, logKey };
    }

    const [existingRecord] = await db.select().from(attendanceRecords).where(and(
      eq(attendanceRecords.employeeId, employeeId),
      eq(attendanceRecords.date, dateKey),
    )).limit(1);

    if (existingRecord) {
      const isoOut = typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null;
      const updates: Record<string, unknown> = {};
      if (isoOut && (!existingRecord.timeOut || existingRecord.timeOut !== isoOut)) {
        updates.timeOut = isoOut;
        updates.duration = calculateDuration(dateKey, existingRecord.timeIn, entry.check_out as string);
      }
      if (Object.keys(updates).length) {
        await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existingRecord.id));
        return { success: true, action: 'updated', logKey };
      }
      return { success: true, action: 'skipped', logKey };
    }

    const isoIn = formatToISO(dateKey, entry.check_in) ?? entry.check_in;
    const isoOut = typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null;
    await db.insert(attendanceRecords).values({
      employeeId,
      date: dateKey,
      timeIn: isoIn,
      timeOut: isoOut,
      duration: typeof entry.check_out === 'string' ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null,
      status: 'present',
      checkInMethod: 'rfid',
      tagUid,
      idempotencyKey: logKey,
      metadata: JSON.stringify(entry),
      createdAt: new Date().toISOString(),
    });
    return { success: true, action: 'created', logKey };
  } catch (error) {
    logger.error('firebase_sync_record_failed', {
      tagUid,
      dateKey,
      logKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, error: String(error), logKey };
  }
}

export async function POST(request: Request) {
  try {
    const secret = request.headers.get('x-firebase-secret');
    if (!env.BETTER_AUTH_SECRET || secret !== env.BETTER_AUTH_SECRET) {
      throw new UnauthorizedError('Unauthorized');
    }

    const body = firebaseSyncBodySchema.parse(await request.json());
    const results: Array<Record<string, unknown>> = [];

    if (body.date && body.check_in) {
      results.push(await processAttendanceRecord(body.tagUid, body.date, {
        check_in: body.check_in,
        ...(body.check_out ? { check_out: body.check_out } : {}),
      }));
    } else if (body.data) {
      for (const dateKey of Object.keys(body.data)) {
        results.push(await processAttendanceRecord(body.tagUid, dateKey, body.data[dateKey]));
      }
    } else {
      throw new BadRequestError('No Firebase attendance payload was provided');
    }

    logger.info('firebase_sync_completed', {
      tagUid: body.tagUid,
      processed: results.length,
      failures: results.filter((result) => result.success === false).length,
    });

    return apiSuccess({
      processed: results.length,
      results,
    }, 'Firebase attendance sync processed successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
