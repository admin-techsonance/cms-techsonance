import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, employees, leaveRequests } from '@/db/schema';
import { withApiHandler } from '@/server/http/handler';
import { BadRequestError } from '@/server/http/errors';
import { apiSuccess } from '@/server/http/response';
import { attendanceBulkRowSchema } from '@/server/validation/attendance-admin';

function parseCsvLine(line: string) {
  return line.split(',').map((part) => part.trim());
}

export const POST = withApiHandler(async (request) => {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) throw new BadRequestError('A CSV file is required');

  const text = await file.text();
  const uniqueLines = Array.from(new Set(text.split('\n').map((line) => line.trim()).filter(Boolean)));
  if (uniqueLines.length < 2) throw new BadRequestError('CSV file must include a header row and at least one data row');

  const headers = parseCsvLine(uniqueLines[0]);
  const requiredColumns = ['EmployeeId', 'Date', 'TimeIn', 'TimeOut'];
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length) throw new BadRequestError(`Missing columns: ${missingColumns.join(', ')}`);

  const columnMap = {
    employeeId: headers.indexOf('EmployeeId'),
    date: headers.indexOf('Date'),
    timeIn: headers.indexOf('TimeIn'),
    timeOut: headers.indexOf('TimeOut'),
  };

  const employeeRows = await db.select({ id: employees.id, employeeId: employees.employeeId }).from(employees);
  const employeeMap = new Map(employeeRows.map((row) => [row.employeeId, row.id]));
  const processedRecords: Array<{ employeeId: string; date: string; status: string }> = [];
  const errors: string[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const line of uniqueLines.slice(1)) {
    const parts = parseCsvLine(line);
    try {
      const row = attendanceBulkRowSchema.parse({
        employeeIdentifier: parts[columnMap.employeeId],
        date: parts[columnMap.date],
        timeIn: parts[columnMap.timeIn] || null,
        timeOut: parts[columnMap.timeOut] || null,
      });
      const dbEmployeeId = employeeMap.get(row.employeeIdentifier);
      if (!dbEmployeeId) {
        errors.push(`Employee ID ${row.employeeIdentifier} not found`);
        continue;
      }

      if (minDate === null || row.date < minDate) {
        minDate = row.date;
      }
      if (maxDate === null || row.date > maxDate) {
        maxDate = row.date;
      }

      let status = 'absent';
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      if (row.timeIn && row.timeOut) {
        checkIn = new Date(`${row.date}T${row.timeIn}`).toISOString();
        checkOut = new Date(`${row.date}T${row.timeOut}`).toISOString();
        const hours = Math.max(0, (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60) - 1);
        status = hours <= 6 ? 'half_day' : 'present';
      }

      const [existing] = await db.select().from(attendance).where(and(
        eq(attendance.employeeId, dbEmployeeId),
        eq(attendance.date, row.date),
      )).limit(1);

      if (existing) {
        await db.update(attendance).set({
          checkIn,
          checkOut,
          status,
          notes: 'Bulk Imported',
        }).where(eq(attendance.id, existing.id));
      } else {
        await db.insert(attendance).values({
          employeeId: dbEmployeeId,
          date: row.date,
          checkIn,
          checkOut,
          status,
          notes: 'Bulk Imported',
        });
      }

      processedRecords.push({ employeeId: row.employeeIdentifier, date: row.date, status });
    } catch (error) {
      errors.push(`Error processing row "${line}": ${error instanceof Error ? error.message : 'Invalid row'}`);
    }
  }

  if (minDate && maxDate) {
    const employeeEntries = Array.from(employeeMap.entries());
    for (let current = new Date(minDate); current <= new Date(maxDate); current.setDate(current.getDate() + 1)) {
      const currentDate = current.toISOString().slice(0, 10);
      const day = current.getDay();
      if (day === 0 || day === 6) continue;

      for (const [employeeIdentifier, employeeId] of employeeEntries) {
        const alreadyProcessed = processedRecords.some((record) => record.employeeId === employeeIdentifier && record.date === currentDate);
        if (alreadyProcessed) continue;

        const [existing] = await db.select().from(attendance).where(and(
          eq(attendance.employeeId, employeeId),
          eq(attendance.date, currentDate),
        )).limit(1);
        if (existing) continue;

        const approvedLeaves = await db.select().from(leaveRequests).where(and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.startDate, currentDate),
          gte(leaveRequests.endDate, currentDate),
        ));

        await db.insert(attendance).values({
          employeeId,
          date: currentDate,
          checkIn: null,
          checkOut: null,
          status: approvedLeaves.length > 0 ? 'leave' : 'absent',
          notes: 'Bulk Import: Auto-marked',
        });
      }
    }
  }

  return apiSuccess({
    processed: processedRecords.length,
    errors,
  }, 'Attendance bulk import completed');
}, { requireAuth: true, roles: ['Admin'] });
