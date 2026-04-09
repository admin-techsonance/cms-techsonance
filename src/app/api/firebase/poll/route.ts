import { getApp, getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref } from 'firebase/database';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags } from '@/db/schema';
import { authenticateRequest } from '@/server/auth/session';
import { env } from '@/server/config/env';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, UnauthorizedError } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';

function getFirebaseDb() {
  if (
    !env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    !env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
    !env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    !env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    !env.NEXT_PUBLIC_FIREBASE_APP_ID
  ) {
    throw new BadRequestError('Firebase environment variables are not configured');
  }

  const app = getApps().length === 0
    ? initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      databaseURL: env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
    : getApp();

  return getDatabase(app);
}

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
  const diffMs = new Date(isoOut).getTime() - new Date(isoIn).getTime();
  const diffMins = Math.round(diffMs / 60000);
  return diffMins > 0 ? diffMins : 0;
}

async function resolveEmployeeId(
  tagUid: string,
  entry: Record<string, unknown>,
  allEmployees: Array<{
    id: number;
    employeeId: string;
    nfcCardId: string | null;
  }>
) {
  let employeeId: number | null = null;
  const normalizedUid = tagUid.replace(/[:\s]/g, '').toLowerCase();
  const tagRows = await db.select().from(nfcTags);
  const matchingTag = tagRows.find((tag) => tag.tagUid.replace(/[:\s]/g, '').toLowerCase() === normalizedUid);
  if (matchingTag?.employeeId) return matchingTag.employeeId;

  const inlineEmployeeId = entry.employee_id ?? entry.employeeId ?? entry.emp_id;
  if (inlineEmployeeId !== undefined) {
    const match = allEmployees.find((employee: any) => String(employee.id) === String(inlineEmployeeId) || employee.employeeId === String(inlineEmployeeId));
    if (match) employeeId = match.id;
  }

  if (!employeeId) {
    const match = allEmployees.find((employee: any) =>
      String(employee.id) === normalizedUid ||
      employee.nfcCardId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid ||
      employee.employeeId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid
    );
    if (match) employeeId = match.id;
  }

  return employeeId;
}

async function processAttendanceData(tagUid: string, rawData: Record<string, Record<string, unknown>>) {
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  const allEmployees = await db.select().from(employees);

  for (const dateKey of Object.keys(rawData)) {
    const entry = rawData[dateKey];
    if (!entry || typeof entry !== 'object' || typeof entry.check_in !== 'string') continue;
    const logKey = `${tagUid}_${dateKey}_${entry.check_in}`;

    try {
      const [existingRecord] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.idempotencyKey, logKey)).limit(1);
      if (existingRecord) {
        const isoIn = formatToISO(dateKey, entry.check_in);
        const isoOut = typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null;
        const updates: Record<string, unknown> = {};
        if (existingRecord.timeIn !== isoIn && isoIn) updates.timeIn = isoIn;
        if (existingRecord.timeOut !== isoOut && isoOut) {
          updates.timeOut = isoOut;
          updates.duration = calculateDuration(dateKey, entry.check_in, entry.check_out as string);
        }
        if (existingRecord.checkInMethod !== 'rfid' && existingRecord.checkInMethod !== 'nfc') {
          updates.checkInMethod = 'rfid';
        }
        if (Object.keys(updates).length) {
          await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existingRecord.id));
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const employeeId = await resolveEmployeeId(tagUid, entry, allEmployees);
      if (!employeeId) {
        result.errors.push(`Unknown tag/id: ${tagUid}`);
        continue;
      }

      await db.insert(attendanceRecords).values({
        employeeId,
        date: dateKey,
        timeIn: formatToISO(dateKey, entry.check_in) ?? entry.check_in,
        timeOut: typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null,
        duration: typeof entry.check_out === 'string' ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null,
        status: 'present',
        checkInMethod: 'rfid',
        tagUid,
        idempotencyKey: logKey,
        metadata: JSON.stringify(entry),
        createdAt: new Date().toISOString(),
      });
      result.created += 1;
    } catch (error) {
      result.errors.push(`${logKey}: ${String(error)}`);
    }
  }

  return result;
}

async function authorizePollRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  const isCron = Boolean(env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`);
  if (isCron) return 'cron';

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const referer = request.headers.get('referer');
  const isSameOrigin = Boolean((origin && host && origin.includes(host)) || (referer && host && referer.includes(host)));

  if (isSameOrigin) {
    await authenticateRequest(request, { required: true, roles: ['Admin'] });
    return 'manual';
  }

  if (env.NODE_ENV === 'production') {
    throw new UnauthorizedError('Unauthorized');
  }

  await authenticateRequest(request, { required: true, roles: ['Admin'] });
  return 'manual';
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const source = await authorizePollRequest(request);
    logger.info('firebase_poll_started', { source });

    const database = getFirebaseDb();
    const snapshot = await get(ref(database, 'attendance'));
    if (!snapshot.exists()) {
      return apiSuccess({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        duration: Date.now() - startedAt,
      }, 'No attendance data in Firebase');
    }

    const data = snapshot.val() as Record<string, Record<string, Record<string, unknown>>>;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const tagUid of Object.keys(data)) {
      const result = await processAttendanceData(tagUid, data[tagUid]);
      created += result.created;
      updated += result.updated;
      skipped += result.skipped;
      errors.push(...result.errors);
    }

    logger.info('firebase_poll_completed', {
      source,
      created,
      updated,
      skipped,
      errors: errors.length,
      durationMs: Date.now() - startedAt,
    });

    return apiSuccess({
      created,
      updated,
      skipped,
      errors: errors.slice(0, 10),
      duration: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, 'Firebase attendance sync completed successfully');
  } catch (error) {
    logger.error('firebase_poll_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startedAt,
    });
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
