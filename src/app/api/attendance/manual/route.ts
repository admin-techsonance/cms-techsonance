import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { ConflictError, NotFoundError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { createManualAttendanceSchema } from '@/server/validation/attendance-admin';

export const POST = withApiHandler(async (request, context) => {
  const payload = createManualAttendanceSchema.parse(await request.json());

  const employeeRow = await db.select({
    id: employees.id,
    employeeId: employees.employeeId,
    name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`.as('name'),
    email: users.email,
    department: employees.department,
    photoUrl: users.avatarUrl,
  }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(eq(employees.id, payload.employeeId)).limit(1);

  if (employeeRow.length === 0) throw new NotFoundError('Employee not found');

  const checkInDate = new Date(payload.checkIn);
  const date = checkInDate.toISOString().slice(0, 10);
  const [existing] = await db.select().from(attendanceRecords).where(and(
    eq(attendanceRecords.employeeId, payload.employeeId),
    eq(attendanceRecords.date, date),
  )).limit(1);
  if (existing) throw new ConflictError('Attendance record already exists for this employee on this date');

  let duration: number | null = null;
  let status = 'present';
  if (payload.checkOut) {
    const checkOutDate = new Date(payload.checkOut);
    duration = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / 60000);
    if (checkInDate.getHours() > 9 || (checkInDate.getHours() === 9 && checkInDate.getMinutes() > 15)) {
      status = 'late';
    }
  }

  const metadata = {
    notes: payload.notes ?? '',
    createdBy: context.auth!.user.id,
    createdByName: `${context.auth!.user.firstName} ${context.auth!.user.lastName}`,
    manualEntry: true,
    entryReason: 'Manual attendance entry by HR/Admin',
  };

  const [created] = await db.insert(attendanceRecords).values({
    employeeId: payload.employeeId,
    date,
    timeIn: payload.checkIn,
    timeOut: payload.checkOut ?? null,
    duration,
    status,
    checkInMethod: 'manual',
    location: null,
    readerId: null,
    tagUid: null,
    locationLatitude: null,
    locationLongitude: null,
    idempotencyKey: null,
    syncedAt: null,
    metadata: JSON.stringify(metadata),
    createdAt: new Date().toISOString(),
  }).returning();

  return apiSuccess({
    ...created,
    employee: {
      id: employeeRow[0].id,
      employeeId: employeeRow[0].employeeId,
      fullName: employeeRow[0].name,
      name: employeeRow[0].name,
      email: employeeRow[0].email,
      department: employeeRow[0].department,
      photoUrl: employeeRow[0].photoUrl,
    },
  }, 'Manual attendance entry created successfully', { status: 201 });
}, { requireAuth: true, roles: ['Admin'] });
