import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { authenticateRequest } from '@/server/auth/session';
import { apiError, apiSuccess } from '@/server/http/response';
import { ApiError, BadRequestError, ForbiddenError, NotFoundError } from '@/server/http/errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  try {
    const auth = await authenticateRequest(request, { required: true });
    const { employeeId } = await params;
    const employeeIdValue = Number(employeeId);
    if (!Number.isInteger(employeeIdValue) || employeeIdValue <= 0) throw new BadRequestError('Valid employee id is required');

    const [employeeData] = await db.select({
      id: employees.id,
      userId: employees.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: employees.department,
      status: employees.status,
      photoUrl: users.avatarUrl,
    }).from(employees).innerJoin(users, eq(employees.userId, users.id)).where(eq(employees.id, employeeIdValue)).limit(1);
    if (!employeeData) throw new NotFoundError('Employee not found');

    const isAdminLike = auth!.user.role === 'Admin' || auth!.user.role === 'SuperAdmin';
    if (!isAdminLike && employeeData.userId !== auth!.user.id) {
      throw new ForbiddenError('You do not have permission to view this attendance history');
    }

    const searchParams = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? '50'), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') ?? '0'), 0);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const source = searchParams.get('source');

    let nfcRecords: any[] = [];
    if (source !== 'legacy') {
      const conditions = [eq(attendanceRecords.employeeId, employeeIdValue)];
      if (startDate) conditions.push(gte(attendanceRecords.date, startDate));
      if (endDate) conditions.push(lte(attendanceRecords.date, endDate));
      const rows = await db.select().from(attendanceRecords).where(and(...conditions)).orderBy(desc(attendanceRecords.date), desc(attendanceRecords.timeIn)).limit(limit + offset);
      nfcRecords = rows.map((row) => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        _source: 'nfc',
      }));
    }

    let legacyRecords: any[] = [];
    if (source !== 'nfc') {
      const conditions = [eq(attendance.employeeId, employeeIdValue)];
      if (startDate) conditions.push(gte(attendance.date, startDate));
      if (endDate) conditions.push(lte(attendance.date, endDate));
      const rows = await db.select().from(attendance).where(and(...conditions)).orderBy(desc(attendance.date)).limit(limit + offset);
      legacyRecords = rows.map((row) => ({
        id: row.id,
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
        metadata: row.notes ? { notes: row.notes } : null,
        createdAt: row.checkIn || row.date,
        _source: 'legacy',
      }));
    }

    const merged = [...nfcRecords, ...legacyRecords]
      .sort((a, b) => {
        const byDate = (b.date || '').localeCompare(a.date || '');
        if (byDate !== 0) return byDate;
        return (b.timeIn || '').localeCompare(a.timeIn || '');
      })
      .slice(offset, offset + limit);

    return apiSuccess({
      employee: {
        id: employeeData.id,
        name: `${employeeData.firstName} ${employeeData.lastName}`,
        email: employeeData.email,
        department: employeeData.department,
        photoUrl: employeeData.photoUrl,
        status: employeeData.status,
      },
      records: merged,
      pagination: {
        limit,
        offset,
        total: merged.length,
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    }, 'Employee attendance fetched successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      return apiError(error.message, { status: error.statusCode, errors: error.details });
    }
    return apiError(error instanceof Error ? error.message : 'Internal server error');
  }
}
