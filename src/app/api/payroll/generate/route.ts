import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payroll, employees, attendance, users, sessions } from '@/db/schema';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';

async function getCurrentUser(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    try {
        const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);

        if (!session) {
            return null;
        }

        const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
        return user || null;
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
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
            // Fetch attendance records for this employee in the date range
            const attendanceRecords = await db.select().from(attendance).where(
                and(
                    eq(attendance.employeeId, employee.id),
                    gte(attendance.date, dateStart),
                    lte(attendance.date, dateEnd)
                )
            );

            // Calculate attendance metrics
            let presentDays = 0;
            let halfDays = 0;
            let leaveDays = 0;
            let absentDays = 0;

            for (const record of attendanceRecords) {
                switch (record.status) {
                    case 'present':
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
            { error: 'Failed to generate payroll', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
