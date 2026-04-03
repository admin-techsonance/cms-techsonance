import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import { db } from "@/db";
import { nfcTags, attendanceRecords } from "@/db/schema";
import { eq } from "drizzle-orm";

// Initialize Firebase (singleton pattern for serverless)
function getFirebaseDb() {
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    return getDatabase(app);
}

// Helper to calculate duration in minutes
function calculateDuration(dateStr: string, timeIn: string, timeOut: string): number | null {
    if (!timeIn || !timeOut || !dateStr) return null;
    try {
        const inDate = new Date(`${dateStr}T${timeIn}`);
        const outDate = new Date(`${dateStr}T${timeOut}`);
        const diffMs = outDate.getTime() - inDate.getTime();
        const diffMins = Math.round(diffMs / 60000);
        return diffMins > 0 ? diffMins : 0;
    } catch {
        return null;
    }
}

// Process attendance data from Firebase snapshot
async function processAttendanceData(tagUid: string, rawData: any): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    if (!tagUid || !rawData) return result;

    for (const dateKey of Object.keys(rawData)) {
        const entry = rawData[dateKey];
        if (!entry || typeof entry !== 'object' || !entry.check_in) continue;

        const logKey = `${tagUid}_${dateKey}_${entry.check_in}`;

        try {
            const existingRecord = await db.select().from(attendanceRecords)
                .where(eq(attendanceRecords.idempotencyKey, logKey)).limit(1);

            if (existingRecord.length > 0) {
                const record = existingRecord[0];

                if (!record.timeOut && entry.check_out) {
                    const duration = calculateDuration(dateKey, record.timeIn, entry.check_out);

                    await (db as any).update(attendanceRecords)
                        .set({
                            timeOut: entry.check_out,
                            duration: duration,
                            metadata: JSON.stringify(entry)
                        })
                        .where(eq(attendanceRecords.id, record.id));

                    result.updated++;
                } else {
                    result.skipped++;
                }
                continue;
            }

            // Find employee by tag
            const tagRecord = await db.select().from(nfcTags)
                .where(eq(nfcTags.tagUid, tagUid)).limit(1);

            if (tagRecord.length === 0) {
                result.errors.push(`Unknown tag: ${tagUid}`);
                continue;
            }

            const employeeId = tagRecord[0].employeeId;
            if (!employeeId) {
                result.errors.push(`Tag ${tagUid} not assigned`);
                continue;
            }

            const duration = entry.check_out ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null;

            await (db as any).insert(attendanceRecords).values({
                employeeId,
                date: dateKey,
                timeIn: entry.check_in,
                timeOut: entry.check_out || null,
                duration,
                status: "present",
                checkInMethod: "nfc",
                tagUid,
                idempotencyKey: logKey,
                metadata: JSON.stringify(entry),
                createdAt: new Date().toISOString()
            });

            result.created++;
        } catch (error) {
            result.errors.push(`${logKey}: ${String(error)}`);
        }
    }

    return result;
}

// GET /api/firebase/poll - Cron-triggered polling endpoint
export async function GET(request: NextRequest) {
    try {
        // Vercel automatically sets CRON_SECRET for cron jobs
        // For manual UI calls, we allow same-origin requests
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;
        const isVercelCron = authHeader === `Bearer ${cronSecret}`;

        // Check if it's a same-origin request (from our UI)
        const origin = request.headers.get("origin");
        const host = request.headers.get("host");
        const referer = request.headers.get("referer");
        const isSameOrigin = origin?.includes(host || "") || referer?.includes(host || "");

        // In production, require either cron auth or same-origin
        if (process.env.NODE_ENV === "production") {
            if (!isVercelCron && !isSameOrigin) {
                console.log("[Firebase Poll] Unauthorized access attempt");
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        console.log(`[Firebase Poll] Starting sync... (source: ${isVercelCron ? "cron" : "manual"})`);
        const startTime = Date.now();

        const database = getFirebaseDb();
        const attendanceRef = ref(database, 'attendance');
        const snapshot = await get(attendanceRef);

        if (!snapshot.exists()) {
            return NextResponse.json({
                success: true,
                message: "No attendance data in Firebase",
                duration: Date.now() - startTime
            });
        }

        const data = snapshot.val();
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalSkipped = 0;
        const allErrors: string[] = [];

        // Iterate over all tag UIDs
        for (const tagUid of Object.keys(data)) {
            const tagData = data[tagUid];
            const result = await processAttendanceData(tagUid, tagData);
            totalCreated += result.created;
            totalUpdated += result.updated;
            totalSkipped += result.skipped;
            allErrors.push(...result.errors);
        }

        const summary = {
            success: true,
            created: totalCreated,
            updated: totalUpdated,
            skipped: totalSkipped,
            errors: allErrors.slice(0, 10), // Limit errors in response
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };

        console.log("[Firebase Poll] Complete:", summary);

        return NextResponse.json(summary);
    } catch (error) {
        console.error("[Firebase Poll] Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
