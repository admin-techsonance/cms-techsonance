import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";
import { db } from "@/db";
import { nfcTags, attendanceRecords, employees } from "@/db/schema";
import { eq, or } from "drizzle-orm";

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
                    const isoOut = entry.check_out ? formatToISO(dateKey, entry.check_out) : null;

                    // Update existing record with better data if needed
                    const updates: any = {};
                    const isoIn = formatToISO(dateKey, entry.check_in);
                    
                    if (record.timeIn !== isoIn && isoIn) {
                        updates.timeIn = isoIn;
                    }
                    if (record.timeOut !== isoOut && isoOut) {
                        updates.timeOut = isoOut;
                        updates.duration = calculateDuration(dateKey, entry.check_in, entry.check_out!);
                    }
                    if (record.checkInMethod !== 'rfid' && record.checkInMethod !== 'nfc') {
                        updates.checkInMethod = 'rfid';
                    }

                    if (Object.keys(updates).length > 0) {
                        await (db as any).update(attendanceRecords)
                            .set(updates)
                            .where(eq(attendanceRecords.id, record.id));
                        result.updated++;
                    } else {
                        result.skipped++;
                    }
                    continue;
                }

            // Find employee by tag, employeeId, or Primary Key (id)
            let employeeId: number | null = null;
            const normalizedUid = tagUid.replace(/[:\s]/g, '').toLowerCase();

            const allEmps = await db.select().from(employees);
            
            // Log sample IDs once to aid discovery
            if (result.created === 0 && result.updated === 0 && result.errors.length === 0) {
                console.log(`[Firebase Discovery] Firebase Key: "${tagUid}" | Normalized: "${normalizedUid}"`);
                console.log(`[Firebase Discovery] DB Sample (IDs):`, allEmps.slice(0, 5).map(e => ({ id: e.id, empId: e.employeeId })));
            }

            // 1. Check nfc_tags table (normalized)
            const tagRecord = await db.select().from(nfcTags);
            const matchingTag = tagRecord.find(t => t.tagUid.replace(/[:\s]/g, '').toLowerCase() === normalizedUid);

            if (matchingTag) {
                employeeId = matchingTag.employeeId;
            } 
            
            // 2. Check if the entry ITSELF has an employee ID (inline)
            if (!employeeId) {
                const inlineEmpId = (entry as any).employee_id || (entry as any).employeeId || (entry as any).emp_id;
                if (inlineEmpId) {
                    const empMatch = allEmps.find(e => 
                        String(e.id) === String(inlineEmpId) || 
                        e.employeeId === String(inlineEmpId)
                    );
                    if (empMatch) {
                        employeeId = empMatch.id;
                        console.log(`[Firebase Mapping] Found employee via inline ID: ${inlineEmpId} for key ${tagUid}`);
                    }
                }
            }

            // 3. Fallback: Check employees table directly (PK id, nfcCardId, or employeeId)
            if (!employeeId) {
                const empMatch = allEmps.find(e => 
                    String(e.id) === normalizedUid || // Match Primary Key "11" -> 11
                    (e.nfcCardId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid) ||
                    (e.employeeId?.replace(/[:\s]/g, '').toLowerCase() === normalizedUid)
                );
                
                if (empMatch) {
                    employeeId = empMatch.id;
                    console.log(`[Firebase Mapping] Found employee via direct comparison: ${empMatch.id} (${empMatch.employeeId}) for key ${tagUid}`);
                }
            }

            if (!employeeId) {
                // Only log if we haven't seen this unknown tag too many times
                if (result.errors.length < 10) {
                    console.log(`[Firebase Debug] Mapping Failed for key "${tagUid}". Entry:`, JSON.stringify(entry));
                }
                result.errors.push(`Unknown tag/id: ${tagUid}`);
                continue;
            }

                const isoIn = formatToISO(dateKey, entry.check_in);
                const isoOut = entry.check_out ? formatToISO(dateKey, entry.check_out) : null;

                const duration = entry.check_out ? calculateDuration(dateKey, entry.check_in, entry.check_out) : null;

                await (db as any).insert(attendanceRecords).values({
                    employeeId,
                    date: dateKey,
                    timeIn: isoIn,
                    timeOut: isoOut,
                    duration,
                    status: "present",
                    checkInMethod: "rfid",
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
