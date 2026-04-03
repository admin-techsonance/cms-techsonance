
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { purchases, vendors } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
        const id = searchParams.get('id') ? parseInt(searchParams.get('id')!) : undefined;
        const vendorId = searchParams.get('vendorId') ? parseInt(searchParams.get('vendorId')!) : undefined;

        if (id) {
            const result = await db.select({
                purchase: purchases,
                vendor: vendors
            })
                .from(purchases)
                .leftJoin(vendors, eq(purchases.vendorId, vendors.id))
                .where(eq(purchases.id, id));

            if (result.length === 0) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

            const { purchase, vendor } = result[0];
            return NextResponse.json({
                ...purchase,
                vendorName: vendor ? vendor.name : 'Unknown Vendor',
                vendor: vendor
            });
        }

        let query = db.select({
            purchase: purchases,
            vendor: vendors
        })
            .from(purchases)
            .leftJoin(vendors, eq(purchases.vendorId, vendors.id))
            .orderBy(desc(purchases.date));

        // Note: Chaining where conditionally in Drizzle requires splitting or using helper
        // For simplicity, if vendorId is present we filter
        if (vendorId) {
            // @ts-ignore
            query = query.where(eq(purchases.vendorId, vendorId));
        }

        if (limit) {
            // @ts-ignore
            query = query.limit(limit);
        }

        const result = await query;
        const formattedResult = result.map(({ purchase, vendor }) => ({
            ...purchase,
            vendorName: vendor ? vendor.name : 'Unknown Vendor',
            vendor: vendor // optionally include full object
        }));

        return NextResponse.json(formattedResult);
    } catch (error) {
        console.error('Error fetching purchases:', error);
        return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { vendorId, date, amount, description, status, billUrl, dueDate } = body;

        if (!vendorId || !date || !amount) {
            return NextResponse.json({ error: 'Vendor, Date and Amount are required' }, { status: 400 });
        }

        const result = await db.insert(purchases).values({
            vendorId: parseInt(vendorId),
            date,
            amount: parseInt(amount),
            description,
            status: status || 'pending',
            billUrl,
            dueDate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }).returning();

        return NextResponse.json(result[0], { status: 201 });
    } catch (error) {
        console.error('Error creating purchase:', error);
        return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const body = await request.json();
        const { vendorId, date, amount, description, status, billUrl, dueDate } = body;

        const result = await db.update(purchases)
            .set({
                vendorId: vendorId ? parseInt(vendorId) : undefined,
                date,
                amount: amount ? parseInt(amount) : undefined,
                description,
                status,
                billUrl,
                dueDate,
                updatedAt: new Date().toISOString()
            })
            .where(eq(purchases.id, parseInt(id)))
            .returning();

        if (result.length === 0) {
            return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
        }

        return NextResponse.json(result[0]);
    } catch (error) {
        console.error('Error updating purchase:', error);
        return NextResponse.json({ error: 'Failed to update purchase' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        await db.delete(purchases).where(eq(purchases.id, parseInt(id)));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting purchase:', error);
        return NextResponse.json({ error: 'Failed to delete purchase' }, { status: 500 });
    }
}
