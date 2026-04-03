import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, nfcTags, attendanceRecords } from "@/db/schema";
import { eq } from "drizzle-orm";

// Helper to calculate duration in minutes
function calculateDuration(dateStr: string, timeIn: string, timeOut: string): number | null {
    if (!timeIn || !timeOut || !dateStr) return null;
    try {
        const inDate = new Date(`${dateStr}T${timeIn}`);
        const outDate = new Date(`${dateStr}T${timeOut}`);
        const diffMs = outDate.getTime() - inDate.getTime();
        const diffMins = Math.round(diffMs / 60000);
        return diffMins > 0 ? diffMins : 0;
    } catch (e) {
        console.error("Error calculating duration:", e);
        return null;
    }
}

// Process a single attendance record
async function processAttendanceRecord(tagUid: string, dateKey: string, entry: { check_in: string; check_out?: string }) {
    if (!tagUid || !dateKey || !entry?.check_in) {
        return { success: false, error: "Invalid data" };
    }

    const logKey = `${tagUid}_${dateKey}_${entry.check_in}`;

    try {
        // Check if record exists
        const existingRecord = await db.select().from(attendanceRecords)
            .where(eq(attendanceRecords.idempotencyKey, logKey)).limit(1);

        if (existingRecord.length > 0) {
            // Record exists: Check for UPDATE (Check Out)
            const record = existingRecord[0];

            if (!record.timeOut && entry.check_out) {
                const duration = calculateDuration(dateKey, record.timeIn, entry.check_out);

                await db.update(attendanceRecords)
                    .set({
                        timeOut: entry.check_out,
                        duration: duration,
                        metadata: JSON.stringify(entry)
                    })
                    .where(eq(attendanceRecords.id, record.id));

                return { success: true, action: "updated", logKey, duration };
            }
            return { success: true, action: "skipped", logKey, reason: "already up to date" };
        }

        // Record does not exist: INSERT (Check In)
        const tagRecord = await db.select().from(nfcTags)
            .where(eq(nfcTags.tagUid, tagUid)).limit(1);

        if (tagRecord.length === 0) {
            return { success: false, error: `Unknown Tag UID: ${tagUid}`, logKey };
        }

        const employeeId = tagRecord[0].employeeId;
        if (!employeeId) {
            return { success: false, error: `Tag ${tagUid} not assigned to employee`, logKey };
        }

        const duration = entry.check_out ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null;

        await db.insert(attendanceRecords).values({
            employeeId: employeeId,
            date: dateKey,
            timeIn: entry.check_in,
            timeOut: entry.check_out || null,
            duration: duration,
            status: "present",
            checkInMethod: "nfc",
            tagUid: tagUid,
            idempotencyKey: logKey,
            metadata: JSON.stringify(entry),
            createdAt: new Date().toISOString()
        });

        return { success: true, action: "created", logKey, duration };
    } catch (error) {
        console.error(`[${logKey}] Error processing:`, error);
        return { success: false, error: String(error), logKey };
    }
}

// POST /api/firebase/sync - Webhook endpoint for Firebase Cloud Functions
export async function POST(request: NextRequest) {
    try {
        // Validate secret key (reuse BETTER_AUTH_SECRET)
        const secret = request.headers.get("x-firebase-secret");
        const expectedSecret = process.env.BETTER_AUTH_SECRET;

        if (!expectedSecret || secret !== expectedSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { tagUid, data } = body;

        if (!tagUid) {
            return NextResponse.json({ error: "Missing tagUid" }, { status: 400 });
        }

        const results: any[] = [];

        // Handle single record format: { tagUid, date, check_in, check_out }
        if (body.date && body.check_in) {
            const result = await processAttendanceRecord(tagUid, body.date, {
                check_in: body.check_in,
                check_out: body.check_out
            });
            results.push(result);
        }
        // Handle full data format: { tagUid, data: { "2026-02-05": { check_in, check_out } } }
        else if (data && typeof data === 'object') {
            for (const dateKey of Object.keys(data)) {
                const entry = data[dateKey];
                if (entry?.check_in) {
                    const result = await processAttendanceRecord(tagUid, dateKey, entry);
                    results.push(result);
                }
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            results
        });

    } catch (error) {
        console.error("Firebase sync error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
