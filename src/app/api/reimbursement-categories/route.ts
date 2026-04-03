import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { reimbursementCategories, sessions, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

// GET - Fetch all active categories
export async function GET(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        let categories = await db.select()
            .from(reimbursementCategories)
            .where(eq(reimbursementCategories.isActive, true))
            .orderBy(reimbursementCategories.name);

        // Auto-seed if no categories exist
        if (categories.length === 0) {
            const now = new Date().toISOString();
            const defaultCategories = [
                { name: 'Travel', description: 'Flight, train, bus, or taxi fares', isActive: true, createdAt: now, updatedAt: now },
                { name: 'Meal', description: 'Food and beverages during business trips', isActive: true, createdAt: now, updatedAt: now },
                { name: 'Lodging', description: 'Hotel or accommodation charges', isActive: true, createdAt: now, updatedAt: now },
                { name: 'Office Supplies', description: 'Stationery, electronics, or other office needs', isActive: true, createdAt: now, updatedAt: now },
                { name: 'Internet/Phone', description: 'Reimbursement for communication bills', isActive: true, createdAt: now, updatedAt: now },
                { name: 'Other', description: 'Miscellaneous expenses', isActive: true, createdAt: now, updatedAt: now },
            ];

            await db.insert(reimbursementCategories).values(defaultCategories);

            // Re-fetch to get IDs
            categories = await db.select()
                .from(reimbursementCategories)
                .where(eq(reimbursementCategories.isActive, true))
                .orderBy(reimbursementCategories.name);
        }

        return NextResponse.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json(
            { error: 'Failed to fetch categories' },
            { status: 500 }
        );
    }
}

// POST - Create new category (admin only)
export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check if user is admin
        if (currentUser.role !== 'admin' && currentUser.role !== 'hr_manager') {
            return NextResponse.json(
                { error: 'Only admins can create categories' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { name, description, maxAmount } = body;

        if (!name) {
            return NextResponse.json(
                { error: 'Category name is required' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        const [category] = await db.insert(reimbursementCategories).values({
            name,
            description: description || null,
            maxAmount: maxAmount || null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        }).returning();

        return NextResponse.json(category, { status: 201 });
    } catch (error: any) {
        console.error('Error creating category:', error);

        if (error.message?.includes('UNIQUE constraint failed')) {
            return NextResponse.json(
                { error: 'Category with this name already exists' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to create category' },
            { status: 500 }
        );
    }
}

// DELETE - Deactivate category (admin only)
export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser(request);

        if (!currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check if user is admin
        if (currentUser.role !== 'admin' && currentUser.role !== 'hr_manager') {
            return NextResponse.json(
                { error: 'Only admins can delete categories' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Category ID is required' },
                { status: 400 }
            );
        }

        const now = new Date().toISOString();

        await db.update(reimbursementCategories)
            .set({
                isActive: false,
                updatedAt: now
            })
            .where(eq(reimbursementCategories.id, parseInt(id)));

        return NextResponse.json({ message: 'Category deactivated successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        return NextResponse.json(
            { error: 'Failed to delete category' },
            { status: 500 }
        );
    }
}
