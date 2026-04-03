import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { reimbursements, reimbursementCategories, employees, users, sessions } from '@/db/schema';
import { eq, and, gte, lte, desc, or, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { hasFullAccess, type UserRole } from '@/lib/permissions';
import { DEFAULT_CURRENCY, safeErrorMessage } from '@/lib/constants';


function generateRequestId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RMB-${year}-${random}`;
}

// GET - Fetch reimbursements
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
        const status = searchParams.get('status');
        const categoryId = searchParams.get('categoryId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const minAmount = searchParams.get('minAmount');
        const maxAmount = searchParams.get('maxAmount');
        const employeeIdParam = searchParams.get('employeeId');

        const isAdmin = hasFullAccess(currentUser.role as UserRole);

        // Build query conditions
        let conditions: any[] = [];

        // If not admin, only show user's own reimbursements
        if (!isAdmin) {
            const [employee] = await db.select()
                .from(employees)
                .where(eq(employees.userId, currentUser.id))
                .limit(1);

            if (!employee) {
                return NextResponse.json([]);
            }

            conditions.push(eq(reimbursements.employeeId, employee.id));
        } else if (employeeIdParam) {
            // Admin filtering by specific employee
            conditions.push(eq(reimbursements.employeeId, parseInt(employeeIdParam)));
        }

        // Apply filters
        if (status) {
            conditions.push(eq(reimbursements.status, status));
        }
        if (categoryId) {
            conditions.push(eq(reimbursements.categoryId, parseInt(categoryId)));
        }
        if (startDate) {
            conditions.push(gte(reimbursements.expenseDate, startDate));
        }
        if (endDate) {
            conditions.push(lte(reimbursements.expenseDate, endDate));
        }
        if (minAmount) {
            conditions.push(gte(reimbursements.amount, parseInt(minAmount)));
        }
        if (maxAmount) {
            conditions.push(lte(reimbursements.amount, parseInt(maxAmount)));
        }

        const query = conditions.length > 0
            ? db.select().from(reimbursements).where(and(...conditions)).orderBy(desc(reimbursements.createdAt))
            : db.select().from(reimbursements).orderBy(desc(reimbursements.createdAt));

        const results = await query;

        return NextResponse.json(results);
    } catch (error) {
        console.error('Error fetching reimbursements:', error);
        return NextResponse.json(
            { error: 'Failed to fetch reimbursements' },
            { status: 500 }
        );
    }
}

// POST - Create new reimbursement
export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get employee record
        const [employee] = await db.select()
            .from(employees)
            .where(eq(employees.userId, currentUser.id))
            .limit(1);

        if (!employee) {
            return NextResponse.json(
                { error: 'Employee record not found' },
                { status: 404 }
            );
        }

        const body = await request.json();
        const { categoryId, amount, expenseDate, description, receiptUrl, status: requestStatus } = body;

        // Validate required fields
        if (!categoryId || !amount || !expenseDate || !description) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();
        const requestId = generateRequestId();
        const status = requestStatus || 'draft';

        const [reimbursement] = await db.insert(reimbursements).values({
            requestId,
            employeeId: employee.id,
            categoryId: parseInt(categoryId),
            amount: parseInt(amount), // Amount in paise
            currency: DEFAULT_CURRENCY,
            expenseDate,
            description,
            receiptUrl: receiptUrl || null,
            status,
            submittedAt: status === 'submitted' ? now : null,
            createdAt: now,
            updatedAt: now,
        }).returning();

        return NextResponse.json(reimbursement, { status: 201 });
    } catch (error) {
        console.error('Error creating reimbursement:', error);
        return NextResponse.json(
            { error: 'Failed to create reimbursement' },
            { status: 500 }
        );
    }
}

// PUT - Update reimbursement
export async function PUT(request: NextRequest) {
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
                { error: 'Reimbursement ID is required' },
                { status: 400 }
            );
        }

        const body = await request.json();
        const { categoryId, amount, expenseDate, description, receiptUrl, status, adminComments } = body;

        const isAdmin = currentUser.role === 'admin' || currentUser.role === 'hr_manager' || currentUser.role === 'cms_administrator';

        // Fetch existing reimbursement
        const [existing] = await db.select()
            .from(reimbursements)
            .where(eq(reimbursements.id, parseInt(id)))
            .limit(1);

        if (!existing) {
            return NextResponse.json(
                { error: 'Reimbursement not found' },
                { status: 404 }
            );
        }

        // Check permissions
        if (!isAdmin) {
            const [employee] = await db.select()
                .from(employees)
                .where(eq(employees.userId, currentUser.id))
                .limit(1);

            if (!employee || existing.employeeId !== employee.id) {
                return NextResponse.json(
                    { error: 'Unauthorized to update this reimbursement' },
                    { status: 403 }
                );
            }

            // Employees can only edit drafts
            if (existing.status !== 'draft') {
                return NextResponse.json(
                    { error: 'Can only edit draft reimbursements' },
                    { status: 400 }
                );
            }
        }

        const now = new Date().toISOString();
        const updates: any = { updatedAt: now };

        // Employee updates
        if (!isAdmin) {
            if (categoryId) updates.categoryId = parseInt(categoryId);
            if (amount) updates.amount = parseInt(amount);
            if (expenseDate) updates.expenseDate = expenseDate;
            if (description) updates.description = description;
            if (receiptUrl !== undefined) updates.receiptUrl = receiptUrl;
            if (status) {
                updates.status = status;
                if (status === 'submitted') {
                    updates.submittedAt = now;
                }
            }
        } else {
            // Admin updates (approval/rejection)
            if (status) {
                updates.status = status;
                updates.reviewedBy = currentUser.id;
                updates.reviewedAt = now;
            }
            if (adminComments !== undefined) {
                updates.adminComments = adminComments;
            }
        }

        await db.update(reimbursements)
            .set(updates)
            .where(eq(reimbursements.id, parseInt(id)));

        const [updated] = await db.select()
            .from(reimbursements)
            .where(eq(reimbursements.id, parseInt(id)))
            .limit(1);

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Error updating reimbursement:', error);
        return NextResponse.json(
            { error: 'Failed to update reimbursement' },
            { status: 500 }
        );
    }
}

// DELETE - Delete reimbursement
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
                { error: 'Reimbursement ID is required' },
                { status: 400 }
            );
        }

        const isAdmin = currentUser.role === 'admin' || currentUser.role === 'hr_manager' || currentUser.role === 'cms_administrator';

        // Fetch existing reimbursement
        const [existing] = await db.select()
            .from(reimbursements)
            .where(eq(reimbursements.id, parseInt(id)))
            .limit(1);

        if (!existing) {
            return NextResponse.json(
                { error: 'Reimbursement not found' },
                { status: 404 }
            );
        }

        // Check permissions
        if (!isAdmin) {
            const [employee] = await db.select()
                .from(employees)
                .where(eq(employees.userId, currentUser.id))
                .limit(1);

            if (!employee || existing.employeeId !== employee.id) {
                return NextResponse.json(
                    { error: 'Unauthorized to delete this reimbursement' },
                    { status: 403 }
                );
            }

            // Employees can only delete drafts
            if (existing.status !== 'draft') {
                return NextResponse.json(
                    { error: 'Can only delete draft reimbursements' },
                    { status: 400 }
                );
            }
        }

        await db.delete(reimbursements)
            .where(eq(reimbursements.id, parseInt(id)));

        return NextResponse.json({ message: 'Reimbursement deleted successfully' });
    } catch (error) {
        console.error('Error deleting reimbursement:', error);
        return NextResponse.json(
            { error: 'Failed to delete reimbursement' },
            { status: 500 }
        );
    }
}
