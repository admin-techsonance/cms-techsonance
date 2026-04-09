import { NextResponse } from 'next/server';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { checkInSchema } from '@/server/validation/attendance';

async function resolveEmployee(tagUid?: string | null, employeeId?: number | null) {
  if (tagUid) {
    const [tag] = await db.select().from(nfcTags).where(eq(nfcTags.tagUid, tagUid)).limit(1);
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new ConflictError('NFC tag is not active');
    if (!tag.employeeId) throw new ConflictError('NFC tag is not assigned to any employee');
    return { employeeId: tag.employeeId, checkInMethod: 'nfc' as const, tag };
  }
  if (!employeeId) throw new BadRequestError('Either tagUid or employeeId must be provided');
  return { employeeId, checkInMethod: 'manual' as const, tag: null };
}

export const POST = withApiHandler(async (request, context) => {
  const payload = checkInSchema.parse(await request.json());

  if (payload.idempotencyKey) {
    const [existingByKey] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.idempotencyKey, payload.idempotencyKey)).limit(1);
    if (existingByKey) {
      return NextResponse.json({ ...existingByKey, message: 'Check-in already processed (idempotency)' });
    }
  }

  const resolved = await resolveEmployee(payload.tagUid, payload.employeeId);
  const [employee] = await db.select({
    id: employees.id,
    name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
    email: users.email,
    department: employees.department,
    photoUrl: users.avatarUrl,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(eq(employees.id, resolved.employeeId)).limit(1);

  if (!employee) throw new NotFoundError('Employee not found');

  const userRole = context.auth!.user.role;
  const isAdminLike = userRole === 'Admin' || userRole === 'SuperAdmin' || userRole === 'Manager';
  if (!isAdminLike) {
    const [selfEmployee] = await db.select().from(employees).where(eq(employees.userId, context.auth!.user.id)).limit(1);
    if (!selfEmployee || selfEmployee.id !== resolved.employeeId) {
      throw new BadRequestError('Insufficient permissions. You can only log your own attendance.');
    }
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);
  const minuteEnd = new Date(minuteStart.getTime() + 60_000);

  const [sameMinuteRecord] = await db.select().from(attendanceRecords).where(and(
    eq(attendanceRecords.employeeId, resolved.employeeId),
    eq(attendanceRecords.date, today),
    gte(attendanceRecords.timeIn, minuteStart.toISOString()),
    lt(attendanceRecords.timeIn, minuteEnd.toISOString()),
  )).limit(1);

  if (sameMinuteRecord) {
    return NextResponse.json({ ...sameMinuteRecord, employee, message: 'Check-in already exists for this minute' });
  }

  if (resolved.tag) {
    await db.update(nfcTags).set({
      lastUsedAt: now.toISOString(),
      readerId: payload.readerId || resolved.tag.readerId,
    }).where(eq(nfcTags.tagUid, resolved.tag.tagUid));
  }

  const [created] = await db.insert(attendanceRecords).values({
    employeeId: resolved.employeeId,
    date: today,
    timeIn: now.toISOString(),
    timeOut: null,
    locationLatitude: payload.locationLatitude ?? null,
    locationLongitude: payload.locationLongitude ?? null,
    duration: null,
    status: 'present',
    checkInMethod: resolved.checkInMethod,
    readerId: payload.readerId ?? null,
    location: payload.location ?? null,
    tagUid: payload.tagUid ?? null,
    idempotencyKey: payload.idempotencyKey ?? null,
    syncedAt: null,
    metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    createdAt: now.toISOString(),
  }).returning();

  return NextResponse.json({ ...created, employee, message: 'Check-in successful' }, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

