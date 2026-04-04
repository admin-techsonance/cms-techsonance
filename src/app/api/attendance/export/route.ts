import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const employeeId = searchParams.get('employee_id');
    const readerId = searchParams.get('reader_id');
    const status = searchParams.get('status');
    const source = searchParams.get('source');

    let parsedEmployeeId: number | null = null;
    if (employeeId) {
      parsedEmployeeId = parseInt(employeeId);
    }

    // Export function shouldn't paginate heavily, let's just pull max 5000 records
    const LIMIT = 5000;

    let nfcResults: any[] = [];
    if (source !== 'legacy') {
      const nfcConditions = [];
      if (startDate) nfcConditions.push(gte(attendanceRecords.date, startDate));
      if (endDate) nfcConditions.push(lte(attendanceRecords.date, endDate));
      if (parsedEmployeeId !== null) nfcConditions.push(eq(attendanceRecords.employeeId, parsedEmployeeId));
      if (readerId) nfcConditions.push(eq(attendanceRecords.readerId, readerId));
      if (status) nfcConditions.push(eq(attendanceRecords.status, status));

      let nfcQuery = db
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          date: attendanceRecords.date,
          timeIn: attendanceRecords.timeIn,
          timeOut: attendanceRecords.timeOut,
          duration: attendanceRecords.duration,
          status: attendanceRecords.status,
          checkInMethod: attendanceRecords.checkInMethod,
          employee: {
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            department: employees.department,
          }
        })
        .from(attendanceRecords)
        .leftJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(desc(attendanceRecords.date), desc(attendanceRecords.timeIn))
        .limit(LIMIT);

      if (nfcConditions.length > 0) {
        nfcQuery = nfcQuery.where(and(...nfcConditions)) as any;
      }

      nfcResults = (await nfcQuery).map(r => ({ ...r, _source: 'nfc' }));
    }

    let legacyResults: any[] = [];
    if (source !== 'nfc' && !readerId) {
      const legacyConditions = [];
      if (startDate) legacyConditions.push(gte(attendance.date, startDate));
      if (endDate) legacyConditions.push(lte(attendance.date, endDate));
      if (parsedEmployeeId !== null) legacyConditions.push(eq(attendance.employeeId, parsedEmployeeId));
      if (status) legacyConditions.push(eq(attendance.status, status));

      let legacyQuery = db
        .select({
          id: attendance.id,
          employeeId: attendance.employeeId,
          date: attendance.date,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          status: attendance.status,
          notes: attendance.notes,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          department: employees.department,
        })
        .from(attendance)
        .leftJoin(employees, eq(attendance.employeeId, employees.id))
        .leftJoin(users, eq(employees.userId, users.id))
        .orderBy(desc(attendance.date))
        .limit(LIMIT);

      if (legacyConditions.length > 0) {
        legacyQuery = legacyQuery.where(and(...legacyConditions)) as any;
      }

      const rawLegacy = await legacyQuery;

      legacyResults = rawLegacy.map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        date: r.date,
        timeIn: r.checkIn,
        timeOut: r.checkOut,
        duration: (r.checkIn && r.checkOut)
          ? Math.floor((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000)
          : null,
        status: r.status,
        checkInMethod: 'legacy',
        employee: {
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          department: r.department,
        },
        _source: 'legacy',
      }));
    }

    const merged = [...nfcResults, ...legacyResults]
      .sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.timeIn || '').localeCompare(a.timeIn || '');
      });

    // Generate CSV
    const headers = [
      'Employee Name', 'Email', 'Department', 'Date', 'Time In', 'Time Out', 'Duration (mins)', 'Status', 'Check-in Method'
    ];
    
    // Proper CSV escaping
    const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return '';
        const s = String(str);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    let csvContent = headers.map(escapeCsv).join(',') + '\n';

    merged.forEach(record => {
      const row = [
        `${record.employee?.firstName} ${record.employee?.lastName}`,
        record.employee?.email,
        record.employee?.department,
        record.date,
        record.timeIn || '',
        record.timeOut || '',
        record.duration || '0',
        record.status,
        record.checkInMethod,
      ];
      csvContent += row.map(escapeCsv).join(',') + '\n';
    });

    const response = new NextResponse(csvContent);
    response.headers.set('Content-Type', 'text/csv');
    response.headers.set('Content-Disposition', `attachment; filename="attendance_export_${new Date().toISOString().split('T')[0]}.csv"`);

    return response;
  } catch (error: any) {
    console.error('GET attendance export error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error.message 
    }, { status: 500 });
  }
}
