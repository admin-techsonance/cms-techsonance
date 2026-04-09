import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '@/server/http/errors';
import { createAttendanceSchema, attendanceStatusSchema } from '@/server/validation/attendance-admin';

export const GET = withApiHandler(async (request, context) => {
  const user = context.auth!.user;
  const searchParams = new URL(request.url).searchParams;
  const limit = Math.min(Number(searchParams.get('limit') ?? '10'), 100);
  const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const employeeIdParam = searchParams.get('employee_id');
  const readerId = searchParams.get('reader_id');
  const status = searchParams.get('status');
  const source = searchParams.get('source');

  let employeeId: number | null = employeeIdParam ? Number(employeeIdParam) : null;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike) {
    const [selfEmployee] = await db.select().from(employees).where(eq(employees.userId, user.id)).limit(1);
    if (!selfEmployee) return NextResponse.json([]);
    employeeId = selfEmployee.id;
  }

  const modernConditions = [];
  if (startDate) modernConditions.push(gte(attendanceRecords.date, startDate));
  if (endDate) modernConditions.push(lte(attendanceRecords.date, endDate));
  if (employeeId) modernConditions.push(eq(attendanceRecords.employeeId, employeeId));
  if (readerId) modernConditions.push(eq(attendanceRecords.readerId, readerId));
  if (status) modernConditions.push(eq(attendanceRecords.status, attendanceStatusSchema.parse(status)));

  const legacyConditions = [];
  if (startDate) legacyConditions.push(gte(attendance.date, startDate));
  if (endDate) legacyConditions.push(lte(attendance.date, endDate));
  if (employeeId) legacyConditions.push(eq(attendance.employeeId, employeeId));
  if (status) legacyConditions.push(eq(attendance.status, attendanceStatusSchema.parse(status)));

  const nfcResults = source === 'legacy' ? [] : await db.select({
    id: attendanceRecords.id,
    employeeId: attendanceRecords.employeeId,
    date: attendanceRecords.date,
    timeIn: attendanceRecords.timeIn,
    timeOut: attendanceRecords.timeOut,
    locationLatitude: attendanceRecords.locationLatitude,
    locationLongitude: attendanceRecords.locationLongitude,
    duration: attendanceRecords.duration,
    status: attendanceRecords.status,
    checkInMethod: attendanceRecords.checkInMethod,
    readerId: attendanceRecords.readerId,
    location: attendanceRecords.location,
    tagUid: attendanceRecords.tagUid,
    idempotencyKey: attendanceRecords.idempotencyKey,
    syncedAt: attendanceRecords.syncedAt,
    metadata: attendanceRecords.metadata,
    createdAt: attendanceRecords.createdAt,
    employee: {
      id: employees.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: employees.department,
      photoUrl: users.avatarUrl,
      status: employees.status,
    },
  }).from(attendanceRecords)
    .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
    .leftJoin(users, eq(employees.userId, users.id))
    .where(modernConditions.length ? and(...modernConditions) : undefined)
    .orderBy(asc(attendanceRecords.date), asc(attendanceRecords.timeIn))
    .limit(limit + offset);

  const legacyResults = source === 'nfc' || readerId ? [] : await db.select({
    id: attendance.id,
    employeeId: attendance.employeeId,
    date: attendance.date,
    checkIn: attendance.checkIn,
    checkOut: attendance.checkOut,
    status: attendance.status,
    notes: attendance.notes,
    empId: employees.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    department: employees.department,
    photoUrl: users.avatarUrl,
  }).from(attendance)
    .leftJoin(employees, eq(attendance.employeeId, employees.id))
    .leftJoin(users, eq(employees.userId, users.id))
    .where(legacyConditions.length ? and(...legacyConditions) : undefined)
    .orderBy(asc(attendance.date))
    .limit(limit + offset);

  const normalizedModern = nfcResults.map((row) => ({ ...row, id: `nfc_${row.id}`, _source: 'nfc' }));
  const normalizedLegacy = legacyResults.map((row) => ({
    id: `legacy_${row.id}`,
    employeeId: row.employeeId,
    date: row.date,
    timeIn: row.checkIn,
    timeOut: row.checkOut,
    locationLatitude: null,
    locationLongitude: null,
    duration: row.checkIn && row.checkOut ? Math.floor((new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 60000) : null,
    status: row.status,
    checkInMethod: 'legacy',
    readerId: null,
    location: null,
    tagUid: null,
    idempotencyKey: null,
    syncedAt: null,
    metadata: row.notes ? JSON.stringify({ notes: row.notes }) : null,
    createdAt: row.checkIn || row.date,
    employee: {
      id: row.empId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      department: row.department,
      photoUrl: row.photoUrl,
      status: row.status,
    },
    _source: 'legacy',
  }));

  const nfcKeys = new Set(normalizedModern.map((row) => `${row.employeeId}_${row.date}`));
  const merged = [...normalizedModern, ...normalizedLegacy.filter((row) => !nfcKeys.has(`${row.employeeId}_${row.date}`))]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timeIn || '').localeCompare(a.timeIn || ''))
    .slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    data: merged,
    message: 'Attendance fetched successfully',
    errors: null,
    meta: { page: Math.floor(offset / limit) + 1, limit, total: merged.length },
  });
}, { requireAuth: true, roles: ['Employee'] });

export const POST = withApiHandler(async (request, context) => {
  const payload = createAttendanceSchema.parse(await request.json());
  const user = context.auth!.user;
  const isAdminLike = user.role === 'Admin' || user.role === 'SuperAdmin' || user.role === 'Manager';
  if (!isAdminLike) {
    const [selfEmployee] = await db.select().from(employees).where(eq(employees.userId, user.id)).limit(1);
    if (!selfEmployee || selfEmployee.id !== payload.employeeId) {
      throw new ForbiddenError('Insufficient permissions. You can only log your own attendance.');
    }
  }

  const [employee] = await db.select().from(employees).where(eq(employees.id, payload.employeeId)).limit(1);
  if (!employee) throw new NotFoundError('Employee not found');

  const [existingModern] = await db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, payload.employeeId), eq(attendanceRecords.date, payload.date))).limit(1);
  const [existingLegacy] = await db.select({ id: attendance.id }).from(attendance).where(and(eq(attendance.employeeId, payload.employeeId), eq(attendance.date, payload.date))).limit(1);
  if (existingModern || existingLegacy) {
    throw new ConflictError('Attendance record already exists for this employee on this date.');
  }

  const duration = payload.duration ?? (payload.timeOut ? Math.floor((new Date(payload.timeOut).getTime() - new Date(payload.timeIn).getTime()) / 60000) : null);
  const [created] = await db.insert(attendanceRecords).values({
    employeeId: payload.employeeId,
    date: payload.date,
    timeIn: payload.timeIn,
    timeOut: payload.timeOut ?? null,
    duration,
    status: payload.status,
    checkInMethod: 'manual',
    location: payload.location ?? null,
    readerId: payload.readerId ?? null,
    metadata: JSON.stringify(payload.notes ? { notes: payload.notes, createdBy: user.id } : { createdBy: user.id }),
    createdAt: new Date().toISOString(),
  }).returning();

  return NextResponse.json(created, { status: 201 });
}, { requireAuth: true, roles: ['Employee'] });

