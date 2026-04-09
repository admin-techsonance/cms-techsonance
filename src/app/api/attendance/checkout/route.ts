import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendanceRecords, employees, nfcTags, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/http/errors';
import { checkOutSchema } from '@/server/validation/attendance';

async function resolveEmployeeForCheckout(tagUid?: string | null, employeeId?: number | null) {
  if (tagUid) {
    const [tag] = await db.select().from(nfcTags).where(eq(nfcTags.tagUid, tagUid)).limit(1);
    if (!tag) throw new NotFoundError('NFC tag not found');
    if (tag.status !== 'active') throw new ConflictError('NFC tag is not active');
    if (!tag.employeeId) throw new ConflictError('NFC tag is not assigned to an employee');
    return { employeeId: tag.employeeId, tag };
  }
  if (!employeeId) throw new BadRequestError('Either tagUid or employeeId must be provided');
  return { employeeId, tag: null };
}

export const POST = withApiHandler(async (request, context) => {
  const payload = checkOutSchema.parse(await request.json());
  const resolved = await resolveEmployeeForCheckout(payload.tagUid, payload.employeeId);

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

  const today = new Date().toISOString().split('T')[0];
  const [activeCheckIn] = await db.select().from(attendanceRecords).where(and(
    eq(attendanceRecords.employeeId, resolved.employeeId),
    eq(attendanceRecords.date, today),
    isNull(attendanceRecords.timeOut),
  )).limit(1);

  if (!activeCheckIn) throw new NotFoundError('No active check-in found for today');

  const now = new Date().toISOString();
  const durationMinutes = Math.floor((new Date(now).getTime() - new Date(activeCheckIn.timeIn).getTime()) / 60000);
  const [updated] = await db.update(attendanceRecords).set({
    timeOut: now,
    duration: durationMinutes,
  }).where(eq(attendanceRecords.id, activeCheckIn.id)).returning();

  if (resolved.tag) {
    await db.update(nfcTags).set({ lastUsedAt: now }).where(eq(nfcTags.tagUid, resolved.tag.tagUid));
  }

  return NextResponse.json({ ...updated, employee });
}, { requireAuth: true, roles: ['Employee'] });

