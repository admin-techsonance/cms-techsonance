import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, attendanceRecords, employees, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ 
        error: 'Authentication required',
        code: 'UNAUTHORIZED' 
      }, { status: 401 });
    }

    // Role authorization check
    if (user.role !== 'cms_administrator' && user.role !== 'hr_manager') {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Admin or HR role required.',
        code: 'FORBIDDEN' 
      }, { status: 403 });
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Get all active employees
    const allEmployees = await db.select()
      .from(employees)
      .where(eq(employees.status, 'active'));

    const totalEmployees = allEmployees.length;

    // ── Query 1: New attendanceRecords table ──
    const todayNfcAttendance = await db.select({
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
      employeeName: users.firstName,
      employeeLastName: users.lastName,
      employeeEmail: users.email,
      employeeDepartment: employees.department,
      employeePhotoUrl: users.avatarUrl,
      employeeNfcCardId: employees.nfcCardId,
    })
      .from(attendanceRecords)
      .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .where(and(
        eq(attendanceRecords.date, today),
        eq(employees.status, 'active')
      ));

    // ── Query 2: Old attendance table (legacy CMS entries) ──
    const todayLegacyAttendance = await db.select({
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
    })
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .innerJoin(users, eq(employees.userId, users.id))
      .where(and(
        eq(attendance.date, today),
        eq(employees.status, 'active')
      ));

    // ── Deduplicate: if same employee has records in both tables, prefer NFC ──
    const nfcEmployeeIds = new Set(todayNfcAttendance.map(r => r.employeeId));
    const uniqueLegacy = todayLegacyAttendance.filter(r => !nfcEmployeeIds.has(r.employeeId));

    // Calculate statistics from both sources
    const allTodayRecords = [
      ...todayNfcAttendance.map(r => ({
        ...r,
        _source: 'nfc' as const,
      })),
      ...uniqueLegacy.map(r => ({
        ...r,
        timeIn: r.checkIn || '',
        timeOut: r.checkOut || null,
        checkInMethod: 'legacy' as const,
        _source: 'legacy' as const,
        // Fill in missing NFC fields
        locationLatitude: null,
        locationLongitude: null,
        duration: (r.checkIn && r.checkOut)
          ? Math.floor((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000)
          : null,
        readerId: null,
        location: null,
        tagUid: null,
        idempotencyKey: null,
        syncedAt: null,
        metadata: r.notes ? JSON.stringify({ notes: r.notes }) : null,
        createdAt: r.checkIn || r.date,
      })),
    ];

    const present = allTodayRecords.length;
    const absent = totalEmployees - present;

    let late = 0;
    let onTime = 0;
    let checkedOut = 0;
    let stillWorking = 0;

    allTodayRecords.forEach(record => {
      // Parse timeIn to check if late (after 9:30 AM)
      try {
        const timeIn = record.timeIn || '';
        // Handle both ISO timestamp and HH:mm:ss formats
        let hour: number, minute: number;
        if (timeIn.includes('T')) {
          const d = new Date(timeIn);
          hour = d.getHours();
          minute = d.getMinutes();
        } else {
          const parts = timeIn.split(':');
          hour = parseInt(parts[0]) || 0;
          minute = parseInt(parts[1]) || 0;
        }

        if (hour > 9 || (hour === 9 && minute > 30)) {
          late++;
        } else {
          onTime++;
        }
      } catch {
        onTime++; // Default to on-time if we can't parse
      }

      // Check if checked out
      if (record.timeOut) {
        checkedOut++;
      } else {
        stillWorking++;
      }
    });

    // Format records with employee details (unified shape)
    const records = allTodayRecords.map(record => ({
      id: record.id,
      employeeId: record.employeeId,
      employee: {
        name: record.employeeName + ' ' + record.employeeLastName,
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
      readerId: ('readerId' in record) ? record.readerId : null,
      location: ('location' in record) ? record.location : null,
      tagUid: ('tagUid' in record) ? record.tagUid : null,
      createdAt: record.createdAt,
      _source: record._source,
    }));

    // Return summary and records
    return NextResponse.json({
      date: today,
      summary: {
        totalEmployees,
        present,
        absent,
        late,
        onTime,
        checkedOut,
        stillWorking,
      },
      records,
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}