
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { vendors } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
        const id = searchParams.get('id') ? parseInt(searchParams.get('id')!) : undefined;

        if (id) {
            const result = await db.select().from(vendors).where(eq(vendors.id, id));
            if (result.length === 0) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
            return NextResponse.json(result[0]);
        }

        let query = db.select().from(vendors).orderBy(desc(vendors.createdAt));

        if (limit) {
            // @ts-ignore
            query = query.limit(limit);
        }

        const result = await query;
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, contactPerson, email, phone, address, status } = body;

        if (!name) {
            return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
        }

        const result = await db.insert(vendors).values({
            name,
            contactPerson,
            email,
            phone,
            address,
            status: status || 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }).returning();

        return NextResponse.json(result[0], { status: 201 });
    } catch (error) {
        console.error('Error creating vendor:', error);
        return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const body = await request.json();
        const { name, contactPerson, email, phone, address, status } = body;

        const result = await db.update(vendors)
            .set({
                name,
                contactPerson,
                email,
                phone,
                address,
                status,
                updatedAt: new Date().toISOString()
            })
            .where(eq(vendors.id, parseInt(id)))
            .returning();

        if (result.length === 0) {
            return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
        }

        return NextResponse.json(result[0]);
    } catch (error) {
        console.error('Error updating vendor:', error);
        return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        await db.delete(vendors).where(eq(vendors.id, parseInt(id)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting vendor:', error);
        return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
    }
}
