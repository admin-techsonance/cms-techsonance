import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { expenseCategories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
    try {
        const allCategories = await db.select().from(expenseCategories).orderBy(expenseCategories.name);
        return NextResponse.json(allCategories, { status: 200 });
    } catch (error) {
        console.error('GET expense categories error:', error);
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, description } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({
                error: "Category name is required",
                code: "MISSING_NAME"
            }, { status: 400 });
        }

        const newCategory = await db.insert(expenseCategories)
            .values({
                name: name.trim(),
                description: description?.trim() || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            })
            .returning();

        return NextResponse.json(newCategory[0], { status: 201 });
    } catch (error) {
        console.error('POST expense categories error:', error);
        // Handle unique constraint violation
        if ((error as any).message?.includes('UNIQUE constraint failed')) {
            return NextResponse.json({
                error: "Category already exists",
                code: "DUPLICATE_CATEGORY"
            }, { status: 400 });
        }
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id || isNaN(parseInt(id))) {
            return NextResponse.json({
                error: "Valid ID is required",
                code: "INVALID_ID"
            }, { status: 400 });
        }

        const deleted = await db.delete(expenseCategories)
            .where(eq(expenseCategories.id, parseInt(id)))
            .returning();

        if (deleted.length === 0) {
            return NextResponse.json({
                error: "Category not found",
                code: "CATEGORY_NOT_FOUND"
            }, { status: 404 });
        }

        return NextResponse.json(deleted[0], { status: 200 });
    } catch (error) {
        console.error('DELETE expense categories error:', error);
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}
