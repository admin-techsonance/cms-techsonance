import crypto from 'node:crypto';
import nextEnv from '@next/env';
import { createClient as createLibsqlClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const requiredEnv = [
  'TURSO_CONNECTION_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} is required`);
  }
}

const sourceDb = createLibsqlClient({
  url: process.env.TURSO_CONNECTION_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tenantInput = {
  name: process.env.MIGRATION_TENANT_NAME ?? 'Default Tenant',
  slug: process.env.MIGRATION_TENANT_SLUG ?? 'default-tenant',
};

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

async function readAll(tableName) {
  const result = await sourceDb.execute(`select * from ${tableName}`);
  return result.rows ?? [];
}

async function upsertRows(tableName, rows, conflict = 'id') {
  if (!rows.length) return;
  const { error } = await supabase.from(tableName).upsert(rows, { onConflict: conflict, ignoreDuplicates: false });
  if (error) throw error;
}

async function createOrGetTenant() {
  const { data: existing, error: existingError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantInput.slug)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('tenants')
    .insert({ name: tenantInput.name, slug: tenantInput.slug, status: 'active' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function migrateUsers(tenantId) {
  const sourceUsers = await readAll('users');
  const userIdMap = new Map();

  for (const row of sourceUsers) {
    const authUserId = crypto.randomUUID();
    userIdMap.set(Number(row.id), authUserId);

    const { error: authError } = await supabase.auth.admin.createUser({
      id: authUserId,
      email: row.email,
      password: `Temp-${crypto.randomBytes(12).toString('hex')}`,
      email_confirm: true,
      user_metadata: {
        firstName: row.first_name,
        lastName: row.last_name,
      },
      app_metadata: {
        tenant_id: tenantId,
        role: row.role,
        migrated_from_sqlite: true,
        legacy_user_id: Number(row.id),
      },
    });

    if (authError && !String(authError.message).toLowerCase().includes('already')) {
      throw authError;
    }
  }

  await upsertRows('tenant_users', sourceUsers.map((row) => ({
    tenant_id: tenantId,
    user_id: userIdMap.get(Number(row.id)),
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    status: row.is_active ? 'active' : 'inactive',
    created_at: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
    updated_at: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
  })), 'tenant_id,user_id');

  await upsertRows('users', sourceUsers.map((row) => ({
    id: userIdMap.get(Number(row.id)),
    tenant_id: tenantId,
    legacy_user_id: Number(row.id),
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    avatar_url: row.avatar_url,
    phone: row.phone,
    last_login: toIsoOrNull(row.last_login),
    is_active: Boolean(row.is_active),
    two_factor_enabled: Boolean(row.two_factor_enabled),
    failed_login_attempts: row.failed_login_attempts ?? 0,
    locked_until: toIsoOrNull(row.locked_until),
    created_at: toIsoOrNull(row.created_at) ?? new Date().toISOString(),
    updated_at: toIsoOrNull(row.updated_at) ?? new Date().toISOString(),
  })), 'id');

  return userIdMap;
}

async function migrateNumericTable(tableName, tenantId, transformRow) {
  const rows = await readAll(tableName);
  if (!rows.length) return 0;

  await upsertRows(
    tableName,
    rows.map((row) => ({
      id: Number(row.id),
      tenant_id: tenantId,
      ...transformRow(row),
    })),
    'id'
  );

  return rows.length;
}

async function main() {
  const tenant = await createOrGetTenant();
  const tenantId = tenant.id;
  const userIdMap = await migrateUsers(tenantId);

  await migrateNumericTable('clients', tenantId, (row) => ({
    company_name: row.company_name,
    contact_person: row.contact_person,
    email: row.email,
    phone: row.phone,
    address: row.address,
    industry: row.industry,
    status: row.status,
    created_by: userIdMap.get(Number(row.created_by)),
    created_at: toIsoOrNull(row.created_at),
    updated_at: toIsoOrNull(row.updated_at),
    notes: row.notes,
  }));

  await migrateNumericTable('projects', tenantId, (row) => ({
    name: row.name,
    description: row.description,
    client_id: Number(row.client_id),
    status: row.status,
    priority: row.priority,
    start_date: row.start_date,
    end_date: row.end_date,
    budget: row.budget,
    created_by: userIdMap.get(Number(row.created_by)),
    created_at: toIsoOrNull(row.created_at),
    updated_at: toIsoOrNull(row.updated_at),
    is_active: Boolean(row.is_active),
  }));

  await migrateNumericTable('employees', tenantId, (row) => ({
    user_id: userIdMap.get(Number(row.user_id)),
    employee_id: row.employee_id,
    nfc_card_id: row.nfc_card_id,
    department: row.department,
    designation: row.designation,
    date_of_joining: row.date_of_joining,
    date_of_birth: row.date_of_birth,
    skills: row.skills ? JSON.parse(row.skills) : null,
    salary: row.salary,
    status: row.status,
    created_at: toIsoOrNull(row.created_at),
    updated_at: toIsoOrNull(row.updated_at),
  }));

  const uuidFkTables = [
    ['project_members', (row) => ({ project_id: Number(row.project_id), user_id: userIdMap.get(Number(row.user_id)), role: row.role, assigned_at: toIsoOrNull(row.assigned_at) })],
    ['milestones', (row) => ({ project_id: Number(row.project_id), title: row.title, description: row.description, due_date: row.due_date, status: row.status, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['sprints', (row) => ({ project_id: Number(row.project_id), name: row.name, goal: row.goal, start_date: row.start_date, end_date: row.end_date, status: row.status, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['tasks', (row) => ({ project_id: Number(row.project_id), milestone_id: row.milestone_id ? Number(row.milestone_id) : null, sprint_id: row.sprint_id ? Number(row.sprint_id) : null, title: row.title, description: row.description, assigned_to: userIdMap.get(Number(row.assigned_to)), status: row.status, priority: row.priority, story_points: row.story_points, due_date: row.due_date, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['time_tracking', (row) => ({ task_id: Number(row.task_id), user_id: userIdMap.get(Number(row.user_id)), hours: row.hours, date: row.date, description: row.description, created_at: toIsoOrNull(row.created_at) })],
    ['project_documents', (row) => ({ project_id: Number(row.project_id), name: row.name, file_url: row.file_url, uploaded_by: userIdMap.get(Number(row.uploaded_by)), uploaded_at: toIsoOrNull(row.uploaded_at) })],
    ['attendance', (row) => ({ employee_id: Number(row.employee_id), date: row.date, check_in: toIsoOrNull(row.check_in), check_out: toIsoOrNull(row.check_out), status: row.status, notes: row.notes })],
    ['leave_requests', (row) => ({ employee_id: Number(row.employee_id), leave_type: row.leave_type, start_date: row.start_date, end_date: row.end_date, reason: row.reason, status: row.status, leave_period: row.leave_period ?? 'full_day', actual_days: row.actual_days ?? 1, approved_by: row.approved_by ? userIdMap.get(Number(row.approved_by)) : null, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['performance_reviews', (row) => ({ employee_id: Number(row.employee_id), reviewer_id: userIdMap.get(Number(row.reviewer_id)), rating: row.rating, review_period: row.review_period, comments: row.comments, created_at: toIsoOrNull(row.created_at) })],
    ['payroll', (row) => ({ employee_id: Number(row.employee_id), month: row.month, year: row.year, base_salary: row.base_salary, present_days: row.present_days, absent_days: row.absent_days, half_days: row.half_days, leave_days: row.leave_days, total_working_days: row.total_working_days, calculated_salary: row.calculated_salary, deductions: row.deductions ?? 0, bonuses: row.bonuses ?? 0, net_salary: row.net_salary, status: row.status, generated_by: userIdMap.get(Number(row.generated_by)), generated_at: toIsoOrNull(row.generated_at), approved_by: row.approved_by ? userIdMap.get(Number(row.approved_by)) : null, approved_at: toIsoOrNull(row.approved_at), paid_at: toIsoOrNull(row.paid_at), notes: row.notes })],
    ['payroll_jobs', (row) => ({ job_key: row.job_key, month: row.month, year: row.year, employee_scope: row.employee_scope ? JSON.parse(row.employee_scope) : [], status: row.status, requested_by: userIdMap.get(Number(row.requested_by)), requested_at: toIsoOrNull(row.requested_at), started_at: toIsoOrNull(row.started_at), completed_at: toIsoOrNull(row.completed_at), result: row.result ? JSON.parse(row.result) : null, error: row.error })],
    ['invoices', (row) => ({ invoice_number: row.invoice_number, client_id: Number(row.client_id), project_id: row.project_id ? Number(row.project_id) : null, amount: row.amount, tax: row.tax, total_amount: row.total_amount, status: row.status, due_date: row.due_date, paid_date: row.paid_date, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at), notes: row.notes, terms_and_conditions: row.terms_and_conditions, payment_terms: row.payment_terms })],
    ['invoice_items', (row) => ({ invoice_id: Number(row.invoice_id), description: row.description, quantity: row.quantity, unit_price: row.unit_price, amount: row.amount })],
    ['payments', (row) => ({ invoice_id: Number(row.invoice_id), amount: row.amount, payment_method: row.payment_method, transaction_id: row.transaction_id, payment_date: row.payment_date, notes: row.notes, created_at: toIsoOrNull(row.created_at) })],
    ['expenses', (row) => ({ category: row.category, description: row.description, amount: row.amount, project_id: row.project_id ? Number(row.project_id) : null, employee_id: row.employee_id ? Number(row.employee_id) : null, date: row.date, receipt_url: row.receipt_url, status: row.status, created_at: toIsoOrNull(row.created_at) })],
    ['expense_categories', (row) => ({ name: row.name, description: row.description, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['vendors', (row) => ({ name: row.name, contact_person: row.contact_person, email: row.email, phone: row.phone, address: row.address, status: row.status, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['purchases', (row) => ({ vendor_id: Number(row.vendor_id), date: row.date, amount: row.amount, description: row.description, status: row.status, bill_url: row.bill_url, due_date: row.due_date, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['pages', (row) => ({ title: row.title, slug: row.slug, content: row.content, meta_title: row.meta_title, meta_description: row.meta_description, meta_keywords: row.meta_keywords, status: row.status, created_by: userIdMap.get(Number(row.created_by)), created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at), published_at: toIsoOrNull(row.published_at) })],
    ['blogs', (row) => ({ title: row.title, slug: row.slug, content: row.content, excerpt: row.excerpt, featured_image: row.featured_image, author_id: userIdMap.get(Number(row.author_id)), category: row.category, tags: row.tags ? JSON.parse(row.tags) : null, status: row.status, views: row.views ?? 0, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at), published_at: toIsoOrNull(row.published_at) })],
    ['media_library', (row) => ({ name: row.name, file_url: row.file_url, file_type: row.file_type, file_size: row.file_size, uploaded_by: userIdMap.get(Number(row.uploaded_by)), created_at: toIsoOrNull(row.created_at) })],
    ['portfolio', (row) => ({ title: row.title, description: row.description, client_name: row.client_name, project_url: row.project_url, thumbnail: row.thumbnail, images: row.images ? JSON.parse(row.images) : null, technologies: row.technologies ? JSON.parse(row.technologies) : null, category: row.category, status: row.status, created_at: toIsoOrNull(row.created_at) })],
    ['tickets', (row) => ({ ticket_number: row.ticket_number, client_id: Number(row.client_id), subject: row.subject, description: row.description, priority: row.priority, status: row.status, assigned_to: row.assigned_to ? userIdMap.get(Number(row.assigned_to)) : null, created_by: row.created_by ? userIdMap.get(Number(row.created_by)) : null, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['ticket_responses', (row) => ({ ticket_id: Number(row.ticket_id), user_id: userIdMap.get(Number(row.user_id)), message: row.message, attachments: row.attachments ? JSON.parse(row.attachments) : null, created_at: toIsoOrNull(row.created_at) })],
    ['notifications', (row) => ({ user_id: userIdMap.get(Number(row.user_id)), title: row.title, message: row.message, type: row.type, link: row.link, is_read: Boolean(row.is_read), created_at: toIsoOrNull(row.created_at) })],
    ['chat_messages', (row) => ({ sender_id: userIdMap.get(Number(row.sender_id)), receiver_id: row.receiver_id ? userIdMap.get(Number(row.receiver_id)) : null, room_id: row.room_id, message: row.message, attachments: row.attachments ? JSON.parse(row.attachments) : null, created_at: toIsoOrNull(row.created_at), is_read: Boolean(row.is_read) })],
    ['company_settings', (row) => ({ company_name: row.company_name, logo_url: row.logo_url, primary_color: row.primary_color, secondary_color: row.secondary_color, email: row.email, phone: row.phone, address: row.address, website: row.website, smtp_host: row.smtp_host, smtp_port: row.smtp_port, smtp_user: row.smtp_user, smtp_password: row.smtp_password, updated_at: toIsoOrNull(row.updated_at) })],
    ['daily_reports', (row) => ({ user_id: userIdMap.get(Number(row.user_id)), date: row.date, available_status: row.available_status, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['daily_report_projects', (row) => ({ daily_report_id: Number(row.daily_report_id), project_id: Number(row.project_id), description: row.description, tracker_time: row.tracker_time, is_covered_work: row.is_covered_work === null ? null : Boolean(row.is_covered_work), is_extra_work: row.is_extra_work === null ? null : Boolean(row.is_extra_work), created_at: toIsoOrNull(row.created_at) })],
    ['inquiries', (row) => ({ alias_name: row.alias_name, tag: row.tag, status: row.status, due_date: row.due_date, app_status: row.app_status, is_favourite: Boolean(row.is_favourite), created_by: userIdMap.get(Number(row.created_by)), created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['inquiry_feeds', (row) => ({ inquiry_id: Number(row.inquiry_id), commented_by: userIdMap.get(Number(row.commented_by)), technology: row.technology, description: row.description, created_at: toIsoOrNull(row.created_at) })],
    ['company_holidays', (row) => ({ date: row.date, reason: row.reason, year: row.year, created_at: toIsoOrNull(row.created_at) })],
    ['business_settings', (row) => ({ business_name: row.business_name, email: row.email, contact_number: row.contact_number, address: row.address, gst_no: row.gst_no, pan: row.pan, tan: row.tan, registration_no: row.registration_no, terms_and_conditions: row.terms_and_conditions, notes: row.notes, payment_terms: row.payment_terms, logo_url: row.logo_url, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['reimbursement_categories', (row) => ({ name: row.name, description: row.description, max_amount: row.max_amount, is_active: row.is_active === null ? true : Boolean(row.is_active), created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['reimbursements', (row) => ({ request_id: row.request_id, employee_id: Number(row.employee_id), category_id: Number(row.category_id), amount: row.amount, currency: row.currency ?? 'INR', expense_date: row.expense_date, description: row.description, receipt_url: row.receipt_url, status: row.status, submitted_at: toIsoOrNull(row.submitted_at), reviewed_by: row.reviewed_by ? userIdMap.get(Number(row.reviewed_by)) : null, reviewed_at: toIsoOrNull(row.reviewed_at), admin_comments: row.admin_comments, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
    ['nfc_tags', (row) => ({ tag_uid: row.tag_uid, employee_id: row.employee_id ? Number(row.employee_id) : null, status: row.status, enrolled_at: toIsoOrNull(row.enrolled_at), enrolled_by: row.enrolled_by ? userIdMap.get(Number(row.enrolled_by)) : null, last_used_at: toIsoOrNull(row.last_used_at), reader_id: row.reader_id, created_at: toIsoOrNull(row.created_at) })],
    ['attendance_records', (row) => ({ employee_id: Number(row.employee_id), date: row.date, time_in: toIsoOrNull(row.time_in), time_out: toIsoOrNull(row.time_out), location_latitude: row.location_latitude, location_longitude: row.location_longitude, duration: row.duration, status: row.status, check_in_method: row.check_in_method, reader_id: row.reader_id, location: row.location, tag_uid: row.tag_uid, idempotency_key: row.idempotency_key, synced_at: toIsoOrNull(row.synced_at), metadata: row.metadata ? JSON.parse(row.metadata) : null, created_at: toIsoOrNull(row.created_at) })],
    ['reader_devices', (row) => ({ reader_id: row.reader_id, name: row.name, location: row.location, type: row.type, status: row.status, ip_address: row.ip_address, last_heartbeat: toIsoOrNull(row.last_heartbeat), config: row.config ? JSON.parse(row.config) : null, created_at: toIsoOrNull(row.created_at), updated_at: toIsoOrNull(row.updated_at) })],
  ];

  for (const [tableName, transform] of uuidFkTables) {
    await migrateNumericTable(tableName, tenantId, transform);
    console.log(`Migrated ${tableName}`);
  }

  console.log(`Migration completed for tenant ${tenant.slug} (${tenantId})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
