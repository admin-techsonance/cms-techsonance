import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { businessSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { safeErrorMessage } from '@/lib/constants';

export async function GET(request: NextRequest) {
    try {
        const settings = await db.select().from(businessSettings).limit(1);
        return NextResponse.json(settings[0] || {}, { status: 200 });
    } catch (error) {
        console.error('GET business settings error:', error);
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            businessName,
            email,
            phone,
            address,
            gstNo,
            pan,
            tan,
            registrationNo,
            termsAndConditions,
            notes,
            paymentTerms,
            logoUrl
        } = body;

        // Validation
        if (!businessName) {
            return NextResponse.json({ error: "Business Name is required" }, { status: 400 });
        }

        const existingSettings = await db.select().from(businessSettings).limit(1);

        if (existingSettings.length > 0) {
            // Update
            const updated = await db.update(businessSettings)
                .set({
                    businessName,
                    email,
                    phone,
                    address,
                    gstNo,
                    pan,
                    tan,
                    registrationNo,
                    termsAndConditions,
                    notes,
                    paymentTerms,
                    logoUrl,
                    updatedAt: new Date().toISOString()
                })
                .where(eq(businessSettings.id, existingSettings[0].id))
                .returning();
            return NextResponse.json(updated[0], { status: 200 });
        } else {
            // Create
            const newSettings = await db.insert(businessSettings)
                .values({
                    businessName,
                    email,
                    phone,
                    address,
                    gstNo,
                    pan,
                    tan,
                    registrationNo,
                    termsAndConditions,
                    notes,
                    paymentTerms,
                    logoUrl,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                })
                .returning();
            return NextResponse.json(newSettings[0], { status: 201 });
        }
    } catch (error) {
        console.error('POST business settings error:', error);
        return NextResponse.json({
            error: safeErrorMessage(error)
        }, { status: 500 });
    }
}
