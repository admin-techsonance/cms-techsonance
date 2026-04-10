import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { isSupabaseDatabaseEnabled } from '@/server/auth/provider';
import { withApiHandler } from '@/server/http/handler';
import { apiSuccess } from '@/server/http/response';
import { getRouteSupabase } from '@/server/supabase/route-helpers';
import { listSupabaseProfilesByAuthIds } from '@/server/supabase/users';

export const GET = withApiHandler(async (_request, context) => {
  const today = new Date().toISOString().slice(0, 10);

  if (isSupabaseDatabaseEnabled()) {
    const accessToken = context.auth?.accessToken;
    if (!accessToken) {
      return apiSuccess({ date: today, summary: { totalEmployees: 0, present: 0, absent: 0, late: 0, onTime: 0, checkedOut: 0, stillWorking: 0 }, records: [] }, 'Today attendance fetched successfully');
    }
    const supabase = getRouteSupabase(accessToken);
    const [{ data: activeEmployees }, { data: todayNfcAttendance }, { data: todayLegacyAttendance }] = await Promise.all([
      supabase.from('employees').select('id,employee_id,nfc_card_id,department,status,user_id').eq('status', 'active'),
      supabase.from('attendance_records').select('*').eq('date', today),
      supabase.from('attendance').select('*').eq('date', today),
    ]);
    const employeeRows = (activeEmployees as { id: number; employee_id: string; nfc_card_id: string | null; department: string; status: string; user_id: string }[] | null) ?? [];
    const profiles = await listSupabaseProfilesByAuthIds(employeeRows.map((row) => row.user_id), accessToken);
    const employeeById = new Map(employeeRows.map((row) => [Number(row.id), row]));
    const totalEmployees = employeeRows.length;
    const nfcRows = ((todayNfcAttendance as Record<string, any>[] | null) ?? []).filter((row) => {
      const employee = employeeById.get(Number(row.employee_id));
      return employee?.status === 'active';
    });
    const nfcEmployeeIds = new Set(nfcRows.map((row) => Number(row.employee_id)));
    const legacyRows = ((todayLegacyAttendance as Record<string, any>[] | null) ?? []).filter((row) => {
      const employee = employeeById.get(Number(row.employee_id));
      return employee?.status === 'active' && !nfcEmployeeIds.has(Number(row.employee_id));
    });
    const allRecords: Record<string, any>[] = [
      ...nfcRows.map((row) => ({ ...row, _source: 'nfc' as const })),
      ...legacyRows.map((row) => ({
        ...row,
        time_in: row.check_in || '',
        time_out: row.check_out || null,
        check_in_method: 'legacy',
        _source: 'legacy' as const,
        duration: row.check_in && row.check_out ? Math.floor((new Date(row.check_out).getTime() - new Date(row.check_in).getTime()) / 60000) : null,
        reader_id: null,
        location: null,
        tag_uid: null,
        created_at: row.check_in || row.date,
      })),
    ];

    let late = 0;
    let onTime = 0;
    let checkedOut = 0;
    let stillWorking = 0;
    for (const record of allRecords) {
      const rawTime = record.time_in || '';
      const value = rawTime ? new Date(rawTime) : null;
      const hour = value ? value.getHours() : 0;
      const minute = value ? value.getMinutes() : 0;
      if (hour > 9 || (hour === 9 && minute > 30)) late += 1;
      else onTime += 1;
      if (record.time_out) checkedOut += 1;
      else stillWorking += 1;
    }

    const records = allRecords.map((record) => {
      const employee = employeeById.get(Number(record.employee_id));
      const profile = employee ? profiles.get(employee.user_id) : null;
      return {
        id: Number(record.id),
        employeeId: Number(record.employee_id),
        employee: {
          name: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
          email: profile?.email ?? null,
          department: employee?.department ?? null,
          photoUrl: profile?.avatar_url ?? null,
          nfcCardId: employee?.nfc_card_id ?? null,
        },
        date: record.date,
        timeIn: record.time_in,
        timeOut: record.time_out,
        duration: record.duration ?? null,
        status: record.status,
        checkInMethod: record.check_in_method,
        readerId: record.reader_id ?? null,
        location: record.location ?? null,
        tagUid: record.tag_uid ?? null,
        createdAt: record.created_at ?? null,
        _source: record._source,
      };
    });

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
  }

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
