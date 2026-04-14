# Supabase Migration

This workspace now includes the initial migration foundation for moving from Turso/SQLite to Supabase Postgres with shared-schema multi-tenancy.

## Added

- Multi-tenant Supabase/Postgres DDL:
  - `/supabase/migrations/20260410_multi_tenant_bootstrap.sql`
- SQLite/Turso to Supabase data migration script:
  - `/scripts/migrate-sqlite-to-supabase.mjs`
- Supabase client/admin/auth/storage/realtime foundations:
  - `/src/lib/supabase/client.ts`
  - `/src/server/supabase/*`
- Tenant onboarding route:
  - `/src/app/api/tenants/register/route.ts`

## Environment

Set these before running the migration:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_PROVIDER=supabase
AUTH_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET_AVATARS=avatars
SUPABASE_STORAGE_BUCKET_PAYROLL=payroll
SUPABASE_STORAGE_BUCKET_EXPENSES=expenses
SUPABASE_STORAGE_BUCKET_PROJECTS=project-files
MIGRATION_TENANT_NAME=Default Tenant
MIGRATION_TENANT_SLUG=default-tenant
```

## Apply schema

Run the SQL in Supabase:

`supabase/migrations/20260410_multi_tenant_bootstrap.sql`

## Run migration

```bash
node ./scripts/migrate-sqlite-to-supabase.mjs
```

## Verify migrated data

```bash
node ./scripts/verify-supabase-migration.mjs
```

This script:

- reads all current SQLite/Turso data
- creates or reuses a single tenant
- migrates users into Supabase Auth
- writes tenant membership and user profile rows
- migrates application tables under the target `tenant_id`
- migrates auth/session/audit support tables that still matter operationally
- merges legacy `company_settings` into Supabase `business_settings`
- remaps legacy payroll job queue states onto the Supabase enum-safe values

## Important

The Supabase query/auth foundations are added, and auth can now be bridged incrementally:

- `AUTH_PROVIDER=legacy`
  - current JWT + Turso auth/session flow
- `AUTH_PROVIDER=supabase`
  - Supabase Auth becomes the session provider
  - the app still maps the authenticated email back to the current local user row so existing APIs can keep working during the transition

The route surface is still largely wired to the legacy Drizzle/Turso data layer. The next migration step is to swap route/service modules from `@/db` to the new Supabase repositories module by module, then flip `DATABASE_PROVIDER=supabase` when the target modules are ready.
