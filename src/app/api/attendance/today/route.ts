import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';

export const GET = withApiHandler(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const allEmployees = await db.select().from(employees).where(eq(employees.status, 'active'));
  const totalEmployees = allEmployees.length;

  const [todayNfcAttendance, todayLegacyAttendance] = await Promise.all([
    db.select({
      id: attendanceRecords.id,
      employeeId: attendanceRecords.employeeId,
      date: attendanceRecords.date,
      timeIn: attendanceRecords.timeIn,
      timeOut: attendanceRecords.timeOut,
      duration: attendanceRecords.duration,
      status: attendanceRecords.status,
      checkInMethod: attendanceRecords.checkInMethod,
      readerId: attendanceRecords.readerId,
      location: attendanceRecords.location,
      tagUid: attendanceRecords.tagUid,
      createdAt: attendanceRecords.createdAt,
      employeeName: users.firstName,
      employeeLastName: users.lastName,
      employeeEmail: users.email,
      employeeDepartment: employees.department,
      employeePhotoUrl: users.avatarUrl,
      employeeNfcCardId: employees.nfcCardId,
    }).from(attendanceRecords).innerJoin(employees, eq(attendanceRecords.employeeId, employees.id)).innerJoin(users, eq(employees.userId, users.id)).where(and(
      eq(attendanceRecords.date, today),
      eq(employees.status, 'active'),
    )),
    db.select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      checkIn: attendance.checkIn,
      checkOut: attendance.checkOut,
      status: attendance.status,
      notes: attendance.notes,
      employeeName: users.firstName,
      employeeLastName: users.lastName,
      employeeEmail: users.email,
      employeeDepartment: employees.department,
      employeePhotoUrl: users.avatarUrl,
      employeeNfcCardId: employees.nfcCardId,
    }).from(attendance).innerJoin(employees, eq(attendance.employeeId, employees.id)).innerJoin(users, eq(employees.userId, users.id)).where(and(
      eq(attendance.date, today),
      eq(employees.status, 'active'),
    )),
  ]);

  const nfcEmployeeIds = new Set(todayNfcAttendance.map((row) => row.employeeId));
  const uniqueLegacy = todayLegacyAttendance.filter((row) => !nfcEmployeeIds.has(row.employeeId));
  const allRecords = [
    ...todayNfcAttendance.map((row) => ({ ...row, _source: 'nfc' as const })),
    ...uniqueLegacy.map((row) => ({
      ...row,
      timeIn: row.checkIn || '',
      timeOut: row.checkOut || null,
      checkInMethod: 'legacy',
      _source: 'legacy' as const,
      duration: row.checkIn && row.checkOut ? Math.floor((new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime()) / 60000) : null,
      readerId: null,
      location: null,
      tagUid: null,
      createdAt: row.checkIn || row.date,
    })),
  ];

  let late = 0;
  let onTime = 0;
  let checkedOut = 0;
  let stillWorking = 0;
  for (const record of allRecords) {
    const rawTime = record.timeIn || '';
    let hour = 0;
    let minute = 0;
    if (rawTime.includes('T')) {
      const value = new Date(rawTime);
      hour = value.getHours();
      minute = value.getMinutes();
    } else {
      const parts = rawTime.split(':');
      hour = Number(parts[0] || 0);
      minute = Number(parts[1] || 0);
    }
    if (hour > 9 || (hour === 9 && minute > 30)) late += 1;
    else onTime += 1;
    if (record.timeOut) checkedOut += 1;
    else stillWorking += 1;
  }

  const records = allRecords.map((record) => ({
    id: record.id,
    employeeId: record.employeeId,
    employee: {
      name: `${record.employeeName} ${record.employeeLastName}`,
      email: record.employeeEmail,
      department: record.employeeDepartment,
      photoUrl: record.employeePhotoUrl,
      nfcCardId: record.employeeNfcCardId,
    },
    date: record.date,
    timeIn: record.timeIn,
    timeOut: record.timeOut,
    duration: record.duration,
    status: record.status,
    checkInMethod: record.checkInMethod,
    readerId: record.readerId,
    location: record.location,
    tagUid: record.tagUid,
    createdAt: record.createdAt,
    _source: record._source,
  }));

  return apiSuccess({
    date: today,
    summary: {
      totalEmployees,
      present: records.length,
      absent: totalEmployees - records.length,
      late,
      onTime,
      checkedOut,
      stillWorking,
    },
    records,
  }, 'Today attendance fetched successfully');
}, { requireAuth: true, roles: ['Admin'] });
