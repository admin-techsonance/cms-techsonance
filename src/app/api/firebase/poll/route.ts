import { getApp, getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref } from 'firebase/database';
import { authenticateRequest } from '@/server/auth/session';
import { env } from '@/server/config/env';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, UnauthorizedError } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';
import { getSupabaseAdminClient } from '@/server/supabase/admin';

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
  allEmployees: Array<Record<string, any>>,
  allTags: Array<Record<string, any>>,
) {
  let employeeId: number | null = null;
  const normalizedUid = tagUid.replace(/[:\s]/g, '').toLowerCase();
  const matchingTag = allTags.find((tag) => tag.tag_uid.replace(/[:\s]/g, '').toLowerCase() === normalizedUid);
  if (matchingTag?.employee_id) return Number(matchingTag.employee_id);

  const inlineEmployeeId = entry.employee_id ?? entry.employeeId ?? entry.emp_id;
  if (inlineEmployeeId !== undefined) {
    const match = allEmployees.find((employee) => String(employee.id) === String(inlineEmployeeId) || employee.employee_id === String(inlineEmployeeId));
    if (match) employeeId = Number(match.id);
  }

  if (!employeeId) {
    const match = allEmployees.find((employee) =>
      String(employee.id) === normalizedUid ||
      employee.nfc_card_id?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid ||
      employee.employee_id?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid
    );
    if (match) employeeId = Number(match.id);
  }

  return employeeId;
}

async function processAttendanceData(
  tagUid: string,
  rawData: Record<string, Record<string, unknown>>,
  allEmployees: Array<Record<string, any>>,
  allTags: Array<Record<string, any>>,
) {
  const supabase = getSupabaseAdminClient() as any;
  const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

  for (const dateKey of Object.keys(rawData)) {
    const entry = rawData[dateKey];
    if (!entry || typeof entry !== 'object' || typeof entry.check_in !== 'string') continue;
    const logKey = `${tagUid}_${dateKey}_${entry.check_in}`;

    try {
      const { data: existingRecord, error: existingError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('idempotency_key', logKey)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existingRecord) {
        const isoIn = formatToISO(dateKey, String(entry.check_in));
        const isoOut = typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null;
        const updates: Record<string, unknown> = {};
        if (existingRecord.time_in !== isoIn && isoIn) updates.time_in = isoIn;
        if (existingRecord.time_out !== isoOut && isoOut) {
          updates.time_out = isoOut;
          updates.duration = calculateDuration(dateKey, String(entry.check_in), String(entry.check_out));
        }
        if (existingRecord.check_in_method !== 'rfid' && existingRecord.check_in_method !== 'nfc') {
          updates.check_in_method = 'rfid';
        }
        if (Object.keys(updates).length) {
          const { error } = await supabase.from('attendance_records').update(updates).eq('id', existingRecord.id);
          if (error) throw error;
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const employeeId = await resolveEmployeeId(tagUid, entry, allEmployees, allTags);
      if (!employeeId) {
        result.errors.push(`Unknown tag/id: ${tagUid}`);
        continue;
      }

      const employee = allEmployees.find((row) => Number(row.id) === employeeId);
      if (!employee?.tenant_id) {
        result.errors.push(`Tenant not found for employee: ${employeeId}`);
        continue;
      }

      const { error } = await supabase.from('attendance_records').insert({
        tenant_id: employee.tenant_id,
        employee_id: employeeId,
        date: dateKey,
        time_in: formatToISO(dateKey, String(entry.check_in)) ?? entry.check_in,
        time_out: typeof entry.check_out === 'string' ? formatToISO(dateKey, entry.check_out) : null,
        duration: typeof entry.check_out === 'string' ? calculateDuration(dateKey, String(entry.check_in), entry.check_out) : null,
        status: 'present',
        check_in_method: 'rfid',
        tag_uid: tagUid,
        idempotency_key: logKey,
        metadata: entry,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;

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

    const supabase = getSupabaseAdminClient() as any;
    const [{ data: allEmployees, error: employeeError }, { data: allTags, error: tagError }] = await Promise.all([
      supabase.from('employees').select('id, tenant_id, employee_id, nfc_card_id'),
      supabase.from('nfc_tags').select('tag_uid, employee_id'),
    ]);
    if (employeeError) throw employeeError;
    if (tagError) throw tagError;

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
      const result = await processAttendanceData(tagUid, data[tagUid], allEmployees ?? [], allTags ?? []);
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
