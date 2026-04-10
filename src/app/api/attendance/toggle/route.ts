import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { attendanceToggleSchema } from '@/server/validation/attendance-admin';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const POST = withApiHandler(async (request) => {
  const payload = attendanceToggleSchema.parse(await request.json());

  if (isSupabaseDatabaseEnabled()) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    if (!accessToken) throw new BadRequestError('Authorization token is required');
    const supabase = getRouteSupabase(accessToken);
    let finalEmployeeId = payload.employeeId ?? null;
    let checkInMethod = 'manual';

    if (payload.tagUid) {
      const { data: tag } = await supabase.from('nfc_tags').select('*').eq('tag_uid', payload.tagUid).single();
      if (!tag) throw new NotFoundError('NFC tag not found');
      if (tag.status !== 'active') throw new UnprocessableEntityError('NFC tag is not active');
      if (!tag.employee_id) throw new BadRequestError('NFC tag is not assigned to an employee');
      finalEmployeeId = Number(tag.employee_id);
      checkInMethod = 'nfc';
      await supabase.from('nfc_tags').update({
        last_used_at: new Date().toISOString(),
        reader_id: payload.readerId ?? tag.reader_id,
      }).eq('tag_uid', payload.tagUid);
    }

    if (!finalEmployeeId) throw new BadRequestError('A valid employee identifier is required');
    const { data: employee } = await supabase.from('employees').select('*').eq('id', finalEmployeeId).single();
    if (!employee) throw new NotFoundError('Employee not found');
    const profiles = await listSupabaseProfilesByAuthIds([String(employee.user_id)], accessToken);
    const profile = profiles.get(String(employee.user_id));
    const employeeView = {
      id: Number(employee.id),
      name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
      email: profile?.email ?? null,
      department: employee.department,
      photoUrl: profile?.avatar_url ?? null,
    };

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const { data: activeCheckIn } = await supabase.from('attendance_records').select('*')
      .eq('employee_id', finalEmployeeId)
      .eq('date', today)
      .is('time_out', null)
      .single();

    if (activeCheckIn) {
      const duration = Math.floor((new Date(now).getTime() - new Date(String(activeCheckIn.time_in)).getTime()) / 60000);
      const { data: updated, error } = await supabase.from('attendance_records').update({
        time_out: now,
        duration,
      }).eq('id', activeCheckIn.id).select('*').single();
      if (error || !updated) throw error ?? new Error('Failed to toggle checkout');
      return apiSuccess({
        action: 'checkout',
        ...updated,
        employee: employeeView,
      }, `Time Out recorded successfully. Duration: ${duration} minutes`);
    }

    if (payload.idempotencyKey) {
      const { data: existing } = await supabase.from('attendance_records').select('*').eq('idempotency_key', payload.idempotencyKey).single();
      if (existing) {
        return apiSuccess({
          action: 'checkin',
          ...existing,
          employee: employeeView,
        }, 'Check-in already processed');
      }
    }

    const { data: created, error } = await supabase.from('attendance_records').insert({
      employee_id: finalEmployeeId,
      date: today,
      time_in: now,
      time_out: null,
      location_latitude: payload.locationLatitude ?? null,
      location_longitude: payload.locationLongitude ?? null,
      duration: null,
      status: 'present',
      check_in_method: checkInMethod,
      reader_id: payload.readerId ?? null,
      location: payload.location ?? null,
      tag_uid: payload.tagUid ?? null,
      idempotency_key: payload.idempotencyKey ?? null,
      synced_at: null,
      metadata: payload.metadata ?? null,
      created_at: now,
    }).select('*').single();
    if (error || !created) throw error ?? new Error('Failed to toggle checkin');

    return apiSuccess({
      action: 'checkin',
      ...created,
      employee: employeeView,
    }, 'Time In recorded successfully', { status: 201 });
  }

  let finalEmployeeId = payload.employeeId ?? null;
  let checkInMethod = 'manual';

  if (payload.tagUid) {
    const [tag] = await db.select().from(nfcTags).where(eq(nfcTags.tagUid, payload.tagUid)).limit(1);
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new UnprocessableEntityError('NFC tag is not active');
    if (!tag.employeeId) throw new BadRequestError('NFC tag is not assigned to an employee');

    finalEmployeeId = tag.employeeId;
    checkInMethod = 'nfc';

    await db.update(nfcTags).set({
      lastUsedAt: new Date().toISOString(),
      readerId: payload.readerId ?? tag.readerId,
    }).where(eq(nfcTags.tagUid, payload.tagUid));
  }

  if (!finalEmployeeId) throw new BadRequestError('A valid employee identifier is required');

  const employee = await db.select({
    id: employees.id,
    name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
    email: users.email,
    department: employees.department,
    photoUrl: users.avatarUrl,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(eq(employees.id, finalEmployeeId)).limit(1);
  if (employee.length === 0) throw new NotFoundError('Employee not found');

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const [activeCheckIn] = await db.select().from(attendanceRecords).where(and(
    eq(attendanceRecords.employeeId, finalEmployeeId),
    eq(attendanceRecords.date, today),
    isNull(attendanceRecords.timeOut),
  )).limit(1);

  if (activeCheckIn) {
    const duration = Math.floor((new Date(now).getTime() - new Date(activeCheckIn.timeIn).getTime()) / 60000);
    const [updated] = await db.update(attendanceRecords).set({
      timeOut: now,
      duration,
    }).where(eq(attendanceRecords.id, activeCheckIn.id)).returning();

    return apiSuccess({
      action: 'checkout',
      ...updated,
      employee: employee[0],
    }, `Time Out recorded successfully. Duration: ${duration} minutes`);
  }

  if (payload.idempotencyKey) {
    const [existing] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.idempotencyKey, payload.idempotencyKey)).limit(1);
    if (existing) {
      return apiSuccess({
        action: 'checkin',
        ...existing,
        employee: employee[0],
      }, 'Check-in already processed');
    }
  }

  const [created] = await db.insert(attendanceRecords).values({
    employeeId: finalEmployeeId,
    date: today,
    timeIn: now,
    timeOut: null,
    locationLatitude: payload.locationLatitude ?? null,
    locationLongitude: payload.locationLongitude ?? null,
    duration: null,
    status: 'present',
    checkInMethod,
    readerId: payload.readerId ?? null,
    location: payload.location ?? null,
    tagUid: payload.tagUid ?? null,
    idempotencyKey: payload.idempotencyKey ?? null,
    syncedAt: null,
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    createdAt: now,
  }).returning();

  return apiSuccess({
    action: 'checkin',
    ...created,
    employee: employee[0],
  }, 'Time In recorded successfully', { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });
