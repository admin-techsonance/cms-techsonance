import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { attendanceToggleSchema } from '@/server/validation/attendance-admin';

export const POST = withApiHandler(async (request) => {
  const payload = attendanceToggleSchema.parse(await request.json());
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
