import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payroll, employees } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import {
  PAYROLL_STATUSES,
  DEFAULT_PAYROLL_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isValidEnum,
  safeErrorMessage,
} from '@/lib/constants';

export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const isAdmin = hasFullAccess(currentUser.role as UserRole);
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employeeId');
        const month = searchParams.get('month');
        const year = searchParams.get('year');
        const status = searchParams.get('status');
        const limit = Math.min(parseInt(searchParams.get('limit') || String(DEFAULT_PAYROLL_PAGE_SIZE)), MAX_PAGE_SIZE);
        const offset = parseInt(searchParams.get('offset') || '0');

        const conditions = [];

        if (!isAdmin) {
            // Employees can only see their own payroll
            const [employee] = await db.select()
                .from(employees)
                .where(eq(employees.userId, currentUser.id))
                .limit(1);

            if (!employee) {
                return NextResponse.json([]);
            }

            conditions.push(eq(payroll.employeeId, employee.id));
        } else if (employeeId) {
            conditions.push(eq(payroll.employeeId, parseInt(employeeId)));
        }

        if (month) {
            conditions.push(eq(payroll.month, month));
        }
        if (year) {
            conditions.push(eq(payroll.year, parseInt(year)));
        }
        if (status) {
            if (isValidEnum(status, PAYROLL_STATUSES)) {
                conditions.push(eq(payroll.status, status));
            }
        }

        let query = db.select().from(payroll);

        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        const payrolls = await query
            .orderBy(desc(payroll.generatedAt))
            .limit(limit)
            .offset(offset);

        return NextResponse.json(payrolls);

    } catch (error) {
        console.error('Error fetching payrolls:', error);
        return NextResponse.json(
            { error: safeErrorMessage(error) },
            { status: 500 }
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Only admin/HR can modify payroll
        if (!hasFullAccess(currentUser.role as UserRole)) {
            return NextResponse.json(
                { error: 'Only admin/HR can modify payroll records' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { id, status: newStatus, deductions, bonuses, notes } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Payroll ID is required' },
                { status: 400 }
            );
        }

        // Fetch existing payroll
        const [existingPayroll] = await db.select().from(payroll).where(eq(payroll.id, id));

        if (!existingPayroll) {
            return NextResponse.json(
                { error: 'Payroll not found' },
                { status: 404 }
            );
        }

        // Prepare update data
        const updateData: any = {};

        if (deductions !== undefined) {
            updateData.deductions = deductions;
        }
        if (bonuses !== undefined) {
            updateData.bonuses = bonuses;
        }
        if (notes !== undefined) {
            updateData.notes = notes;
        }

        // Recalculate net salary if deductions or bonuses changed
        if (deductions !== undefined || bonuses !== undefined) {
            const finalDeductions = deductions !== undefined ? deductions : existingPayroll.deductions || 0;
            const finalBonuses = bonuses !== undefined ? bonuses : existingPayroll.bonuses || 0;
            updateData.netSalary = existingPayroll.calculatedSalary - finalDeductions + finalBonuses;
        }

        // Handle status changes
        if (newStatus) {
            if (!isValidEnum(newStatus, PAYROLL_STATUSES)) {
                return NextResponse.json(
                    { error: `Invalid status. Must be one of: ${PAYROLL_STATUSES.join(', ')}` },
                    { status: 400 }
                );
            }

            updateData.status = newStatus;

            if (newStatus === 'approved' && !existingPayroll.approvedBy) {
                updateData.approvedBy = currentUser.id;
                updateData.approvedAt = new Date().toISOString();
            }

            if (newStatus === 'paid' && !existingPayroll.paidAt) {
                updateData.paidAt = new Date().toISOString();
            }
        }

        // Update payroll
        const [updatedPayroll] = await db
            .update(payroll)
            .set(updateData)
            .where(eq(payroll.id, id))
            .returning();

        return NextResponse.json(updatedPayroll);

    } catch (error) {
        console.error('Error updating payroll:', error);
        return NextResponse.json(
            { error: safeErrorMessage(error) },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Only admin/HR can delete payroll
        if (!hasFullAccess(currentUser.role as UserRole)) {
            return NextResponse.json(
                { error: 'Only admin/HR can delete payroll records' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Payroll ID is required' },
                { status: 400 }
            );
        }

        // Fetch existing payroll to check status
        const [existingPayroll] = await db.select().from(payroll).where(eq(payroll.id, parseInt(id)));

        if (!existingPayroll) {
            return NextResponse.json(
                { error: 'Payroll not found' },
                { status: 404 }
            );
        }

        // Only allow deletion of draft payrolls
        if (existingPayroll.status !== 'draft') {
            return NextResponse.json(
                { error: 'Only draft payrolls can be deleted' },
                { status: 400 }
            );
        }

        await db.delete(payroll).where(eq(payroll.id, parseInt(id)));

        return NextResponse.json({ success: true, message: 'Payroll deleted successfully' });

    } catch (error) {
        console.error('Error deleting payroll:', error);
        return NextResponse.json(
            { error: safeErrorMessage(error) },
            { status: 500 }
        );
    }
}
