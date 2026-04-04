
import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './src/db/schema';
import { eq, or } from 'drizzle-orm';

async function checkSyncStatus() {
  const client = createClient({
    url: process.env.TURSO_CONNECTION_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const db = drizzle(client, { schema });

  const emps = await db.select().from(schema.employees).limit(10);
  console.log('--- Employees ---');
  console.log(JSON.stringify(emps.map(e => ({ id: e.id, employeeId: e.employeeId, nfcCardId: e.nfcCardId })), null, 2));

  const attendance = await db.select().from(schema.attendanceRecords).limit(10);
  console.log('--- Attendance Records ---');
  console.log(JSON.stringify(attendance, null, 2));

  // Check for specific tag if we know it from logs
  const testTag = '04:19:91:CA:E8:14:91';
  console.log(`--- Testing Search for Tag: ${testTag} ---`);
  
  const tagInNfc = await db.select().from(schema.nfcTags).where(eq(schema.nfcTags.tagUid, testTag)).limit(1);
  console.log('In nfcTags:', tagInNfc.length > 0 ? 'Found' : 'Not Found');

  const empWithCard = await db.select().from(schema.employees).where(eq(schema.employees.nfcCardId, testTag)).limit(1);
  console.log('In employees.nfcCardId:', empWithCard.length > 0 ? 'Found' : 'Not Found');

  const empWithId = await db.select().from(schema.employees).where(eq(schema.employees.employeeId, testTag)).limit(1);
  console.log('In employees.employeeId:', empWithId.length > 0 ? 'Found' : 'Not Found');
}

checkSyncStatus().catch(console.error);
