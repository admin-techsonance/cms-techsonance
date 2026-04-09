import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';
import { createClient } from '@libsql/client';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const migrationsDir = path.join(process.cwd(), 'drizzle');
const journalPath = path.join(migrationsDir, 'meta', '_journal.json');

function readMigrationJournal() {
  return JSON.parse(fs.readFileSync(journalPath, 'utf8'));
}

function readMigrationEntries() {
  const journal = readMigrationJournal();

  return journal.entries.map((entry) => {
    const filename = `${entry.tag}.sql`;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');

    return {
      tag: entry.tag,
      hash: crypto.createHash('sha256').update(sql).digest('hex'),
      createdAt: entry.when,
    };
  });
}

async function queryRows(client, sql) {
  const result = await client.execute(sql);
  return result.rows ?? [];
}

async function hasTable(client, tableName) {
  const rows = await queryRows(
    client,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${tableName}' LIMIT 1`
  );

  return rows.length > 0;
}

async function getColumns(client, tableName) {
  if (!(await hasTable(client, tableName))) {
    return new Set();
  }

  const rows = await queryRows(client, `PRAGMA table_info("${tableName}")`);
  return new Set(rows.map((row) => String(row.name)));
}

async function ensureMigrationsTable(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
}

async function ensureColumn(client, tableName, columnName, definitionSql) {
  const columns = await getColumns(client, tableName);

  if (columns.has(columnName)) {
    return false;
  }

  await client.execute(`ALTER TABLE "${tableName}" ADD "${columnName}" ${definitionSql}`);
  return true;
}

async function repairAuthSchema(client) {
  const repairs = [];

  if (await hasTable(client, 'users')) {
    if (
      await ensureColumn(client, 'users', 'failed_login_attempts', 'integer DEFAULT 0 NOT NULL')
    ) {
      repairs.push('users.failed_login_attempts');
    }

    if (await ensureColumn(client, 'users', 'locked_until', 'text')) {
      repairs.push('users.locked_until');
    }
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "auth_refresh_sessions" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "refresh_token_hash" text NOT NULL UNIQUE,
      "is_persistent" integer DEFAULT true NOT NULL,
      "user_agent" text,
      "ip_address" text,
      "expires_at" text NOT NULL,
      "rotated_at" text,
      "revoked_at" text,
      "created_at" text NOT NULL,
      "last_used_at" text,
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
    )
  `);
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "auth_refresh_sessions_user_id_idx" ON "auth_refresh_sessions" ("user_id")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "auth_refresh_sessions_expires_at_idx" ON "auth_refresh_sessions" ("expires_at")'
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "token_blacklist" (
      "id" text PRIMARY KEY NOT NULL,
      "token_id" text NOT NULL UNIQUE,
      "user_id" integer,
      "reason" text NOT NULL,
      "expires_at" text NOT NULL,
      "created_at" text NOT NULL,
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
    )
  `);
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "token_blacklist_user_id_idx" ON "token_blacklist" ("user_id")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "token_blacklist_expires_at_idx" ON "token_blacklist" ("expires_at")'
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "audit_logs" (
      "id" text PRIMARY KEY NOT NULL,
      "actor_user_id" integer,
      "action" text NOT NULL,
      "resource_type" text NOT NULL,
      "resource_id" text,
      "method" text NOT NULL,
      "path" text NOT NULL,
      "correlation_id" text,
      "details" text,
      "created_at" text NOT NULL,
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
    )
  `);
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "audit_logs_actor_user_id_idx" ON "audit_logs" ("actor_user_id")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs" ("resource_type", "resource_id")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at")'
  );

  if (await hasTable(client, 'auth_refresh_sessions')) {
    if (
      await ensureColumn(client, 'auth_refresh_sessions', 'is_persistent', 'integer DEFAULT 1 NOT NULL')
    ) {
      repairs.push('auth_refresh_sessions.is_persistent');
    }
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "password_reset_otps" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL,
      "email" text NOT NULL,
      "otp_hash" text NOT NULL,
      "expires_at" text NOT NULL,
      "verified_at" text,
      "consumed_at" text,
      "attempts" integer DEFAULT 0 NOT NULL,
      "created_at" text NOT NULL,
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
    )
  `);
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "password_reset_otps_user_id_idx" ON "password_reset_otps" ("user_id")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "password_reset_otps_email_idx" ON "password_reset_otps" ("email")'
  );
  await client.execute(
    'CREATE INDEX IF NOT EXISTS "password_reset_otps_expires_at_idx" ON "password_reset_otps" ("expires_at")'
  );

  if (repairs.length > 0) {
    console.log(`Repaired auth schema objects: ${repairs.join(', ')}`);
  }
}

async function getMigrationCount(client) {
  const rows = await queryRows(client, 'SELECT COUNT(*) AS count FROM "__drizzle_migrations"');
  return Number(rows[0]?.count ?? 0);
}

async function getExistingMigrationTimestamps(client) {
  const rows = await queryRows(client, 'SELECT created_at FROM "__drizzle_migrations"');
  return new Set(rows.map((row) => Number(row.created_at)));
}

async function detectAppliedBaseline(client) {
  const usersColumns = await getColumns(client, 'users');
  const tasksColumns = await getColumns(client, 'tasks');
  const projectsColumns = await getColumns(client, 'projects');
  const employeesColumns = await getColumns(client, 'employees');
  const invoicesColumns = await getColumns(client, 'invoices');
  const leaveRequestsColumns = await getColumns(client, 'leave_requests');
  const ticketsColumns = await getColumns(client, 'tickets');

  const checks = {
    '0000_massive_sentinels':
      (await hasTable(client, 'users')) &&
      (await hasTable(client, 'projects')) &&
      (await hasTable(client, 'tasks')) &&
      (await hasTable(client, 'activity_logs')),
    '0001_easy_rachel_grey':
      (await hasTable(client, 'sprints')) &&
      tasksColumns.has('sprint_id') &&
      tasksColumns.has('story_points'),
    '0002_zippy_spot': projectsColumns.has('is_active'),
    '0003_futuristic_deathstrike':
      (await hasTable(client, 'company_holidays')) &&
      (await hasTable(client, 'daily_reports')) &&
      (await hasTable(client, 'daily_report_projects')) &&
      (await hasTable(client, 'inquiries')) &&
      (await hasTable(client, 'inquiry_feeds')),
    '0004_slimy_baron_strucker':
      (await hasTable(client, 'attendance_records')) ||
      ((await hasTable(client, 'auth_refresh_sessions')) &&
        (await hasTable(client, 'token_blacklist')) &&
        (await hasTable(client, 'audit_logs'))) ||
      (usersColumns.has('failed_login_attempts') &&
        usersColumns.has('locked_until') &&
        employeesColumns.has('nfc_card_id') &&
        invoicesColumns.has('terms_and_conditions') &&
        invoicesColumns.has('payment_terms') &&
        leaveRequestsColumns.has('leave_period') &&
        leaveRequestsColumns.has('actual_days') &&
        ticketsColumns.has('created_by')),
    '0005_easy_boomer': await hasTable(client, 'payroll_jobs'),
    '0006_even_frightful':
      (await hasTable(client, 'password_reset_otps')) &&
      (await getColumns(client, 'auth_refresh_sessions')).has('is_persistent'),
  };

  const appliedTags = [];

  for (const tag of Object.keys(checks)) {
    if (!checks[tag]) {
      break;
    }

    appliedTags.push(tag);
  }

  return appliedTags;
}

async function baselineExistingDatabase(client) {
  await ensureMigrationsTable(client);

  const appliedTags = await detectAppliedBaseline(client);

  if (appliedTags.length === 0) {
    console.log('No existing baseline detected; migrations will run normally.');
    return;
  }

  const migrationEntries = readMigrationEntries();
  const appliedEntries = migrationEntries.filter((entry) => appliedTags.includes(entry.tag));
  const existingTimestamps = await getExistingMigrationTimestamps(client);
  const missingEntries = appliedEntries.filter((entry) => !existingTimestamps.has(entry.createdAt));

  if (missingEntries.length === 0) {
    if ((await getMigrationCount(client)) > 0) {
      console.log('Drizzle migrations table already initialized and aligned.');
    } else {
      console.log('No baseline rows needed; migrations will run normally.');
    }
    return;
  }

  for (const entry of missingEntries) {
    await client.execute({
      sql: 'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
      args: [entry.hash, entry.createdAt],
    });
  }

  console.log(
    `Recorded existing migration history for: ${missingEntries.map((entry) => entry.tag).join(', ')}`
  );
}

async function main() {
  const url = process.env.TURSO_CONNECTION_URL;

  if (!url) {
    throw new Error('TURSO_CONNECTION_URL is required to run migrations.');
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await repairAuthSchema(client);
  await baselineExistingDatabase(client);
  client.close();

  const result = spawnSync('npm', ['exec', 'drizzle-kit', 'migrate'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
