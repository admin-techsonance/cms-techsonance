
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendance, employees, leaveRequests, users } from '@/db/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/constants';

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const text = await file.text();
        const uniqueLines = new Set(text.split('\n'));
        const rows = Array.from(uniqueLines).map(line => line.split(','));
        const headers = rows[0].map(h => h.trim());

        // Basic CSV Validation
        const requiredColumns = ['EmployeeId', 'Date', 'TimeIn', 'TimeOut'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));

        if (missingColumns.length > 0) {
            return NextResponse.json({
                error: `Missing columns: ${missingColumns.join(', ')}`,
                code: 'INVALID_CSV'
            }, { status: 400 });
        }

        const columnMap = {
            EmployeeId: headers.indexOf('EmployeeId'),
            Date: headers.indexOf('Date'),
            TimeIn: headers.indexOf('TimeIn'),
            TimeOut: headers.indexOf('TimeOut'),
        };

        const dataRows = rows.slice(1).filter(r => r.length > 1); // Skip empty lines
        const processedRecords = [];
        const errors = [];

        // Get all employees for mapping
        const allEmployees = await db.select({
            id: employees.id,
            employeeId: employees.employeeId
        }).from(employees);

        const employeeMap = new Map(allEmployees.map(e => [e.employeeId, e.id]));

        // Find date range
        let minDate = new Date();
        let maxDate = new Date(0);

        // First Pass: Process explicit records
        for (const row of dataRows) {
            try {
                const empIdStr = row[columnMap.EmployeeId]?.trim();
                const dateStr = row[columnMap.Date]?.trim();
                const timeInStr = row[columnMap.TimeIn]?.trim();
                const timeOutStr = row[columnMap.TimeOut]?.trim();

                if (!empIdStr || !dateStr) continue;

                const dbEmployeeId = employeeMap.get(empIdStr);
                if (!dbEmployeeId) {
                    errors.push(`Employee ID ${empIdStr} not found`);
                    continue;
                }

                const dateObj = new Date(dateStr);
                if (dateObj < minDate) minDate = dateObj;
                if (dateObj > maxDate) maxDate = dateObj;

                // Calculate Work Hours
                let status = 'absent';
                let checkIn = null;
                let checkOut = null;

                if (timeInStr && timeOutStr) {
                    checkIn = new Date(`${dateStr}T${timeInStr}`).toISOString();
                    checkOut = new Date(`${dateStr}T${timeOutStr}`).toISOString();

                    const inTime = new Date(`${dateStr}T${timeInStr}`).getTime();
                    const outTime = new Date(`${dateStr}T${timeOutStr}`).getTime();
                    let diffHours = (outTime - inTime) / (1000 * 60 * 60);

                    // Deduct 1 hour for lunch
                    diffHours = Math.max(0, diffHours - 1);

                    if (diffHours <= 6) {
                        status = 'half_day';
                    } else {
                        status = 'present';
                    }
                }

                // Insert or Update Attendance
                // Check for existing
                const existing = await db.select()
                    .from(attendance)
                    .where(and(
                        eq(attendance.employeeId, dbEmployeeId),
                        eq(attendance.date, dateStr)
                    ));

                if (existing.length > 0) {
                    await db.update(attendance)
                        .set({
                            checkIn,
                            checkOut,
                            status,
                            notes: 'Bulk Imported'
                        })
                        .where(eq(attendance.id, existing[0].id));
                } else {
                    await db.insert(attendance)
                        .values({
                            employeeId: dbEmployeeId,
                            date: dateStr,
                            checkIn,
                            checkOut,
                            status,
                            notes: 'Bulk Imported'
                        });
                }

                processedRecords.push({ employeeId: empIdStr, date: dateStr, status });

            } catch (err) {
                errors.push(`Error processing row: ${row.join(',')} - ${(err as Error).message}`);
            }
        }

        // Second Pass: Handle Missing Records (Absent / On Leave)
        if (processedRecords.length > 0) {
            // Sort records by date to iterate efficiently if needed, or just iterate dates
            // Iterate through each day in range for each employee

            const startDate = minDate;
            const endDate = maxDate;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDateStr = d.toISOString().split('T')[0];
                const dayOfWeek = d.getDay();

                // Skip weekends if assumed not working? User didn't specify, but typical. 
                // "if there is no attendence for the working day" - usually Mon-Fri
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                for (const [empIdStr, dbId] of employeeMap.entries()) {
                    // Check if we already processed this employee for this date
                    const alreadyProcessed = processedRecords.some(r => r.employeeId === empIdStr && r.date === currentDateStr);

                    if (!alreadyProcessed) {
                        // Check if already exists in DB (maybe manually added) to avoid overwriting invalidly
                        const existingInDb = await db.select()
                            .from(attendance)
                            .where(and(
                                eq(attendance.employeeId, dbId),
                                eq(attendance.date, currentDateStr)
                            ));

                        if (existingInDb.length > 0) continue;

                        // Check for Approved Leave
                        const leaves = await db.select()
                            .from(leaveRequests)
                            .where(and(
                                eq(leaveRequests.employeeId, dbId),
                                eq(leaveRequests.status, 'approved'),
                                lte(leaveRequests.startDate, currentDateStr),
                                gte(leaveRequests.endDate, currentDateStr)
                            ));

                        let status = 'absent';
                        if (leaves.length > 0) {
                            status = 'on_leave'; // Or 'leave' depending on enum
                        }

                        // Insert absent/leave record
                        await db.insert(attendance).values({
                            employeeId: dbId,
                            date: currentDateStr,
                            checkIn: null,
                            checkOut: null,
                            status: status === 'on_leave' ? 'leave' : 'absent',
                            notes: 'Bulk Import: Auto-marked'
                        });
                    }
                }
            }
        }

        return NextResponse.json({
            message: 'Processing complete',
            processed: processedRecords.length,
            errors
        });

    } catch (error) {
        console.error('Bulk Import Error:', error);
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}
