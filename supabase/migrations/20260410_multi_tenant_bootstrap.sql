create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('SuperAdmin', 'Admin', 'Manager', 'Employee', 'Viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type public.employee_status as enum ('active', 'inactive', 'terminated', 'on_leave', 'resigned');
  end if;
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'review', 'done', 'blocked');
  end if;
  if not exists (select 1 from pg_type where typname = 'sprint_status') then
    create type public.sprint_status as enum ('planning', 'active', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'payroll_status') then
    create type public.payroll_status as enum ('draft', 'approved', 'paid', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type public.expense_status as enum ('draft', 'submitted', 'pending', 'approved', 'rejected', 'paid');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('present', 'absent', 'late', 'half_day', 'leave');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'reimbursement_status') then
    create type public.reimbursement_status as enum ('draft', 'submitted', 'approved', 'rejected', 'returned', 'paid');
  end if;
end $$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  plan_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_users (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role public.app_role not null default 'Employee',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, email)
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_user_id bigint unique,
  email text not null,
  first_name text not null,
  last_name text not null,
  role public.app_role not null default 'Employee',
  avatar_url text,
  phone text,
  last_login timestamptz,
  is_active boolean not null default true,
  two_factor_enabled boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.sessions (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, token)
);

create table if not exists public.auth_refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  refresh_token_hash text not null,
  is_persistent boolean not null default true,
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (tenant_id, refresh_token_hash)
);

create table if not exists public.token_blacklist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token_id text not null,
  user_id uuid references public.users(id) on delete set null,
  reason text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, token_id)
);

create table if not exists public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  method text not null,
  path text not null,
  correlation_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null,
  module text not null,
  details jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_name text not null,
  contact_person text not null,
  email text not null,
  phone text,
  address text,
  industry text,
  status text not null default 'active',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text
);

create table if not exists public.client_communications (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id bigint not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  attachments jsonb,
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);

create table if not exists public.projects (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  client_id bigint not null references public.clients(id) on delete restrict,
  status public.project_status not null default 'planning',
  priority text not null default 'medium',
  start_date date,
  end_date date,
  budget numeric(15,4),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  deleted_at timestamptz
);

create table if not exists public.project_members (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null,
  assigned_at timestamptz not null default now(),
  unique (tenant_id, project_id, user_id)
);

create table if not exists public.milestones (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sprints (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  name text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  status public.sprint_status not null default 'planning',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sprints_valid_dates check (start_date <= end_date)
);

create table if not exists public.tasks (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  milestone_id bigint references public.milestones(id) on delete set null,
  sprint_id bigint references public.sprints(id) on delete set null,
  title text not null,
  description text,
  assigned_to uuid not null references public.users(id) on delete restrict,
  status public.task_status not null default 'todo',
  priority text not null default 'medium',
  story_points integer,
  due_date date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.time_tracking (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id bigint not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  hours numeric(8,2) not null,
  date date not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_documents (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  name text not null,
  file_url text not null,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.employees (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  employee_id text not null,
  nfc_card_id text,
  department text not null,
  designation text not null,
  date_of_joining date not null,
  date_of_birth date,
  skills jsonb,
  salary numeric(15,4),
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, employee_id),
  unique nulls not distinct (tenant_id, nfc_card_id)
);

create table if not exists public.attendance (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status public.attendance_status not null,
  notes text,
  unique (tenant_id, employee_id, date)
);

create table if not exists public.leave_requests (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'pending',
  leave_period text not null default 'full_day',
  actual_days numeric(6,2) not null default 1,
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_reviews (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  reviewer_id uuid not null references public.users(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  review_period text not null,
  comments text,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  month text not null,
  year integer not null,
  base_salary numeric(15,4) not null,
  present_days integer not null default 0,
  absent_days integer not null default 0,
  half_days integer not null default 0,
  leave_days integer not null default 0,
  total_working_days integer not null,
  calculated_salary numeric(15,4) not null,
  deductions numeric(15,4) not null default 0,
  bonuses numeric(15,4) not null default 0,
  net_salary numeric(15,4) not null,
  status public.payroll_status not null default 'draft',
  generated_by uuid not null references public.users(id) on delete restrict,
  generated_at timestamptz not null default now(),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  unique (tenant_id, employee_id, month, year)
);

create table if not exists public.payroll_jobs (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_key text not null,
  month text not null,
  year integer not null,
  employee_scope jsonb not null,
  status public.payroll_status not null default 'draft',
  requested_by uuid not null references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  unique (tenant_id, job_key)
);

create table if not exists public.expense_categories (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.expenses (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null,
  description text not null,
  amount numeric(15,4) not null,
  project_id bigint references public.projects(id) on delete set null,
  employee_id bigint references public.employees(id) on delete set null,
  date date not null,
  receipt_url text,
  status public.expense_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id bigint not null references public.vendors(id) on delete restrict,
  date date not null,
  amount numeric(15,4) not null,
  description text,
  status text not null default 'pending',
  bill_url text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null,
  client_id bigint not null references public.clients(id) on delete restrict,
  project_id bigint references public.projects(id) on delete set null,
  amount numeric(15,4) not null,
  tax numeric(15,4) not null,
  total_amount numeric(15,4) not null,
  status text not null default 'draft',
  due_date date not null,
  paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text,
  terms_and_conditions text,
  payment_terms text,
  unique (tenant_id, invoice_number)
);

create table if not exists public.invoice_items (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id bigint not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity integer not null,
  unit_price numeric(15,4) not null,
  amount numeric(15,4) not null
);

create table if not exists public.payments (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id bigint not null references public.invoices(id) on delete cascade,
  amount numeric(15,4) not null,
  payment_method text not null,
  transaction_id text,
  payment_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pages (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  slug text not null,
  content text,
  meta_title text,
  meta_description text,
  meta_keywords text,
  status text not null default 'draft',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, slug)
);

create table if not exists public.blogs (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  slug text not null,
  content text not null,
  excerpt text,
  featured_image text,
  author_id uuid not null references public.users(id) on delete restrict,
  category text not null,
  tags jsonb,
  status text not null default 'draft',
  views integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, slug)
);

create table if not exists public.media_library (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_type text not null,
  file_size bigint not null,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  client_name text not null,
  project_url text,
  thumbnail text,
  images jsonb,
  technologies jsonb,
  category text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_number text not null,
  client_id bigint not null references public.clients(id) on delete restrict,
  subject text not null,
  description text not null,
  priority text not null default 'medium',
  status public.ticket_status not null default 'open',
  assigned_to uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ticket_number)
);

create table if not exists public.ticket_responses (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid references public.users(id) on delete set null,
  room_id text,
  message text not null,
  attachments jsonb,
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);

create table if not exists public.company_settings (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_name text not null,
  logo_url text,
  primary_color text,
  secondary_color text,
  email text not null,
  phone text,
  address text,
  website text,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_password text,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  available_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_report_projects (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  daily_report_id bigint not null references public.daily_reports(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  description text not null,
  tracker_time integer not null,
  is_covered_work boolean,
  is_extra_work boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alias_name text not null,
  tag text not null,
  status text not null,
  due_date date,
  app_status text,
  is_favourite boolean not null default false,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiry_feeds (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inquiry_id bigint not null references public.inquiries(id) on delete cascade,
  commented_by uuid not null references public.users(id) on delete restrict,
  technology text,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_holidays (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date date not null,
  reason text not null,
  year integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  business_name text not null,
  email text,
  contact_number text,
  address text,
  gst_no text,
  pan text,
  tan text,
  registration_no text,
  terms_and_conditions text,
  notes text,
  payment_terms text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reimbursement_categories (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  max_amount numeric(15,4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.reimbursements (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id text not null,
  employee_id bigint not null references public.employees(id) on delete cascade,
  category_id bigint not null references public.reimbursement_categories(id) on delete restrict,
  amount numeric(15,4) not null,
  currency text not null default 'INR',
  expense_date date not null,
  description text not null,
  receipt_url text,
  status public.reimbursement_status not null,
  submitted_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_id)
);

create table if not exists public.nfc_tags (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tag_uid text not null,
  employee_id bigint references public.employees(id) on delete set null,
  status text not null,
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references public.users(id) on delete set null,
  last_used_at timestamptz,
  reader_id text,
  created_at timestamptz not null default now(),
  unique (tenant_id, tag_uid)
);

create table if not exists public.attendance_records (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  date date not null,
  time_in timestamptz not null,
  time_out timestamptz,
  location_latitude numeric(10,7),
  location_longitude numeric(10,7),
  duration integer,
  status public.attendance_status not null,
  check_in_method text not null,
  reader_id text,
  location text,
  tag_uid text,
  idempotency_key text,
  synced_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, idempotency_key)
);

create table if not exists public.reader_devices (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reader_id text not null,
  name text not null,
  location text not null,
  type text not null,
  status text not null,
  ip_address inet,
  last_heartbeat timestamptz,
  config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reader_id)
);

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid,
    (
      select tenant_id
      from public.tenant_users
      where user_id = auth.uid()
        and status = 'active'
      limit 1
    )
  );
$$;

alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.auth_refresh_sessions enable row level security;
alter table public.token_blacklist enable row level security;
alter table public.password_reset_otps enable row level security;
alter table public.audit_logs enable row level security;
alter table public.activity_logs enable row level security;
alter table public.clients enable row level security;
alter table public.client_communications enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.sprints enable row level security;
alter table public.tasks enable row level security;
alter table public.time_tracking enable row level security;
alter table public.project_documents enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.payroll enable row level security;
alter table public.payroll_jobs enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.vendors enable row level security;
alter table public.purchases enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.pages enable row level security;
alter table public.blogs enable row level security;
alter table public.media_library enable row level security;
alter table public.portfolio enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_responses enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;
alter table public.company_settings enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_projects enable row level security;
alter table public.inquiries enable row level security;
alter table public.inquiry_feeds enable row level security;
alter table public.company_holidays enable row level security;
alter table public.business_settings enable row level security;
alter table public.reimbursement_categories enable row level security;
alter table public.reimbursements enable row level security;
alter table public.nfc_tags enable row level security;
alter table public.attendance_records enable row level security;
alter table public.reader_devices enable row level security;

create policy tenants_isolation on public.tenants
for all
using (id = public.current_tenant_id())
with check (id = public.current_tenant_id());

do $$
declare
  table_name text;
  table_names text[] := array[
    'tenant_users','users','sessions','auth_refresh_sessions','token_blacklist','password_reset_otps',
    'audit_logs','activity_logs','clients','client_communications','projects','project_members',
    'milestones','sprints','tasks','time_tracking','project_documents','employees','attendance',
    'leave_requests','performance_reviews','payroll','payroll_jobs','expense_categories','expenses',
    'vendors','purchases','invoices','invoice_items','payments','pages','blogs','media_library',
    'portfolio','tickets','ticket_responses','notifications','chat_messages','company_settings',
    'daily_reports','daily_report_projects','inquiries','inquiry_feeds','company_holidays',
    'business_settings','reimbursement_categories','reimbursements','nfc_tags','attendance_records',
    'reader_devices'
  ];
begin
  foreach table_name in array table_names loop
    execute format(
      'create policy %I on public.%I for all using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  end loop;
end $$;

create index if not exists tenant_users_user_idx on public.tenant_users(user_id);
create index if not exists users_tenant_email_idx on public.users(tenant_id, email);
create index if not exists employees_tenant_user_idx on public.employees(tenant_id, user_id);
create index if not exists clients_tenant_status_idx on public.clients(tenant_id, status);
create index if not exists projects_tenant_status_idx on public.projects(tenant_id, status, priority);
create index if not exists tasks_tenant_status_idx on public.tasks(tenant_id, status, sprint_id);
create index if not exists attendance_tenant_date_idx on public.attendance(tenant_id, date);
create index if not exists payroll_tenant_period_idx on public.payroll(tenant_id, month, year);
create index if not exists invoices_tenant_due_idx on public.invoices(tenant_id, due_date, status);
create index if not exists expenses_tenant_date_idx on public.expenses(tenant_id, date, status);
create index if not exists reimbursements_tenant_status_idx on public.reimbursements(tenant_id, status);
create index if not exists tickets_tenant_status_idx on public.tickets(tenant_id, status, priority);
create index if not exists attendance_records_tenant_date_idx on public.attendance_records(tenant_id, date);

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', false),
  ('payroll', 'payroll', false),
  ('expenses', 'expenses', false),
  ('project-files', 'project-files', false)
on conflict (id) do nothing;

alter publication supabase_realtime add table public.tasks;
