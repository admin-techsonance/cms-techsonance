import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { payroll, employees, users, sessions } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

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

export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employeeId');
        const month = searchParams.get('month');
        const year = searchParams.get('year');
        const status = searchParams.get('status');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        let query = db.select().from(payroll);
        const conditions = [];

        if (employeeId) {
            conditions.push(eq(payroll.employeeId, parseInt(employeeId)));
        }
        if (month) {
            conditions.push(eq(payroll.month, month));
        }
        if (year) {
            conditions.push(eq(payroll.year, parseInt(year)));
        }
        if (status) {
            conditions.push(eq(payroll.status, status));
        }

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
            { error: 'Failed to fetch payrolls' },
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
            { error: 'Failed to update payroll' },
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
            { error: 'Failed to delete payroll' },
            { status: 500 }
        );
    }
}
