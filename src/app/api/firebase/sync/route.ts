import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { employees, nfcTags, attendanceRecords } from "@/db/schema";
import { eq, or, and } from "drizzle-orm";

// Helper to format time into ISO string (YYYY-MM-DDTHH:mm:ss)
function formatToISO(dateStr: string, timeStr: string): string | null {
    if (!dateStr || !timeStr) return null;
    try {
        if (timeStr.includes('T')) return timeStr;
        let time = timeStr.trim();
        const ampmMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)/i);
        if (ampmMatch) {
            let hours = parseInt(ampmMatch[1], 10);
            const minutes = ampmMatch[2];
            const seconds = ampmMatch[3] || "00";
            const ampm = ampmMatch[4].toLowerCase();
            if (ampm === "pm" && hours < 12) hours += 12;
            if (ampm === "am" && hours === 12) hours = 0;
            time = `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
        }
        const parts = time.split(":");
        if (parts.length === 2) time = `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
        return `${dateStr}T${time}`;
    } catch {
        return null;
    }
}

// Helper to calculate duration in minutes
function calculateDuration(dateStr: string, timeIn: string, timeOut: string): number | null {
    if (!timeIn || !timeOut || !dateStr) return null;
    try {
        const isoIn = formatToISO(dateStr, timeIn);
        const isoOut = formatToISO(dateStr, timeOut);
        if (!isoIn || !isoOut) return null;
        const inDate = new Date(isoIn);
        const outDate = new Date(isoOut);
        const diffMs = outDate.getTime() - inDate.getTime();
        const diffMins = Math.round(diffMs / 60000);
        return diffMins > 0 ? diffMins : 0;
    } catch {
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
        // 1. Find employee by tag, employeeId, or Primary Key (id)
        let employeeId: number | null = null;
        const normalizedUid = tagUid.replace(/[:\s]/g, '').toLowerCase();
        const allEmps = await db.select().from(employees);

        // A. Check nfc_tags table
        const tagRecord = await db.select().from(nfcTags);
        const matchingTag = tagRecord.find(t => t.tagUid.replace(/[:\s]/g, '').toLowerCase() === normalizedUid);
        if (matchingTag) employeeId = matchingTag.employeeId;

        // B. Check inline ID
        if (!employeeId) {
            const inlineEmpId = (entry as any).employee_id || (entry as any).employeeId || (entry as any).emp_id;
            if (inlineEmpId) {
                const empMatch = allEmps.find(e => String(e.id) === String(inlineEmpId) || e.employeeId === String(inlineEmpId));
                if (empMatch) employeeId = empMatch.id;
            }
        }

        // C. Fallback: employees table direct match
        if (!employeeId) {
            const empMatch = allEmps.find(e => 
                String(e.id) === normalizedUid || 
                (e.nfcCardId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid) ||
                (e.employeeId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid)
            );
            if (empMatch) employeeId = empMatch.id;
        }

        if (!employeeId) {
            return { success: false, error: `Unknown Tag UID or Employee ID: ${tagUid}`, logKey };
        }

        // 2. Check if a record already exists for this employee on this date
        const existingRecord = await db.select()
            .from(attendanceRecords)
            .where(
                and(
                    eq(attendanceRecords.employeeId, employeeId),
                    eq(attendanceRecords.date, dateKey)
                )
            ).limit(1);

        if (existingRecord.length > 0) {
            const record = existingRecord[0];
            const isoOut = entry.check_out ? formatToISO(dateKey, entry.check_out) : null;
            const updates: any = {};

            // If we have a new checkout time (or it was missing), and it's DIFFERENT or newer
            if (isoOut && (!record.timeOut || record.timeOut !== isoOut)) {
                updates.timeOut = isoOut;
                updates.duration = calculateDuration(dateKey, record.timeIn, entry.check_out!);
            }

            if (Object.keys(updates).length > 0) {
                await (db as any).update(attendanceRecords)
                    .set(updates)
                    .where(eq(attendanceRecords.id, record.id));
                return { success: true, action: "updated", logKey };
            }
            return { success: true, action: "skipped", logKey };
        }

        // 3. Insert new record
        const isoIn = formatToISO(dateKey, entry.check_in);
        const isoOut = entry.check_out ? formatToISO(dateKey, entry.check_out) : null;
        const duration = (isoIn && isoOut && entry.check_out) ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null;

        await db.insert(attendanceRecords).values({
            employeeId: employeeId,
            date: dateKey,
            timeIn: isoIn || entry.check_in,
            timeOut: isoOut,
            duration: duration,
            status: "present",
            checkInMethod: "rfid",
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
