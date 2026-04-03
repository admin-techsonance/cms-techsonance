import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payroll, employees, attendance, attendanceRecords, users, sessions } from '@/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import { safeErrorMessage } from '@/lib/constants';

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Only admin/HR can generate payroll
        if (!hasFullAccess(currentUser.role as UserRole)) {
            return NextResponse.json(
                { error: 'Only admin/HR can generate payroll' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { employeeIds, month, year, startDate, endDate } = body;

        // Validate required fields
        if (!month || !year) {
            return NextResponse.json(
                { error: 'Month and year are required' },
                { status: 400 }
            );
        }

        // Determine date range
        let dateStart: string;
        let dateEnd: string;

        if (startDate && endDate) {
            dateStart = startDate;
            dateEnd = endDate;
        } else {
            // Use month/year to calculate date range
            const monthNum = parseInt(month.split('-')[1]);
            const yearNum = parseInt(year);
            dateStart = `${yearNum} -${String(monthNum).padStart(2, '0')}-01`;
            const lastDay = new Date(yearNum, monthNum, 0).getDate();
            dateEnd = `${yearNum} -${String(monthNum).padStart(2, '0')} -${String(lastDay).padStart(2, '0')} `;
        }

        // Calculate total working days (exclude weekends)
        let totalWorkingDays = 0;
        const start = new Date(dateStart);
        const end = new Date(dateEnd);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
                totalWorkingDays++;
            }
        }

        // Fetch employees to process
        let employeesToProcess;
        if (employeeIds === 'all' || !employeeIds) {
            employeesToProcess = await db.select().from(employees);
        } else {
            employeesToProcess = await db.select().from(employees).where(
                inArray(employees.id, employeeIds)
            );
        }

        const generatedPayrolls = [];

        // Process each employee
        for (const employee of employeesToProcess) {
            // 1. Fetch legacy attendance records
            const legacyRecords = await db.select().from(attendance).where(
                and(
                    eq(attendance.employeeId, employee.id),
                    gte(attendance.date, dateStart),
                    lte(attendance.date, dateEnd)
                )
            );

            // 2. Fetch new NFC/manual attendance records
            // We import attendanceRecords for this inside the DB schema
            const nfcRecords = await db.select().from(attendanceRecords).where(
                and(
                    eq(attendanceRecords.employeeId, employee.id),
                    gte(attendanceRecords.date, dateStart),
                    lte(attendanceRecords.date, dateEnd)
                )
            );

            // Deduplicate: if an NFC record exists for a date, prefer it over legacy
            const mergedRecordsMap = new Map();
            for (const rec of legacyRecords) {
                mergedRecordsMap.set(rec.date, rec);
            }
            for (const rec of nfcRecords) {
                mergedRecordsMap.set(rec.date, rec);
            }

            const allAttendanceForEmployee = Array.from(mergedRecordsMap.values());

            // Calculate attendance metrics
            let presentDays = 0;
            let halfDays = 0;
            let leaveDays = 0;
            let absentDays = 0;

            for (const record of allAttendanceForEmployee) {
                switch (record.status) {
                    case 'present':
                    case 'late': // Counting late as present for baseline salary
                        presentDays++;
                        break;
                    case 'half_day':
                        halfDays++;
                        break;
                    case 'on_leave':
                    case 'leave':
                        leaveDays++;
                        break;
                    case 'absent':
                        absentDays++;
                        break;
                }
            }

            // Calculate salary
            const baseSalary = employee.salary || 0;

            if (baseSalary === 0) {
                console.warn(`Employee ${employee.employeeId} has no salary set, skipping...`);
                continue;
            }

            // Formula: (baseSalary / totalWorkingDays) * (presentDays + (halfDays * 0.5) + leaveDays)
            const effectiveDays = presentDays + (halfDays * 0.5) + leaveDays;
            const calculatedSalary = Math.round((baseSalary / totalWorkingDays) * effectiveDays);
            const netSalary = calculatedSalary; // Can be adjusted with deductions/bonuses later

            // Insert payroll record
            const [newPayroll] = await db.insert(payroll).values({
                employeeId: employee.id,
                month: month,
                year: year,
                baseSalary: baseSalary,
                presentDays: presentDays,
                absentDays: absentDays,
                halfDays: halfDays,
                leaveDays: leaveDays,
                totalWorkingDays: totalWorkingDays,
                calculatedSalary: calculatedSalary,
                deductions: 0,
                bonuses: 0,
                netSalary: netSalary,
                status: 'draft',
                generatedBy: currentUser.id,
                generatedAt: new Date().toISOString(),
            }).returning();

            generatedPayrolls.push(newPayroll);
        }

        return NextResponse.json({
            success: true,
            message: `Generated payroll for ${generatedPayrolls.length} employee(s)`,
            payrolls: generatedPayrolls,
            processed: generatedPayrolls.length,
        });

    } catch (error) {
        console.error('Error generating payroll:', error);
        return NextResponse.json(
            { error: safeErrorMessage(error) },
            { status: 500 }
        );
    }
}
