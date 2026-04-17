-- ============================================================
-- RBAC (Role-Based Access Control) Migration
-- Creates centralized role, permission, and role_permissions tables
-- ============================================================

-- Ensure pgcrypto extension exists
create extension if not exists pgcrypto;

-- Drop existing enums if any (for idempotency)
do $$
begin
  if exists (select 1 from pg_type where typname = 'role_category') then
    drop type public.role_category cascade;
  end if;
  if exists (select 1 from pg_type where typname = 'permission_action') then
    drop type public.permission_action cascade;
  end if;
end $$;

-- Create ENUMS for role categories and permission actions
create type public.role_category as enum (
  'administration',
  'management',
  'technical',
  'creative',
  'content',
  'quality',
  'client',
  'support',
  'business'
);

create type public.permission_action as enum (
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'export'
);

-- Create ROLES table - Centralized role definitions
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_key text not null, -- e.g., 'admin', 'project_manager', 'developer'
  name text not null, -- Display name
  description text,
  category public.role_category not null,
  level integer not null default 0, -- Hierarchy level (higher = more access)
  is_active boolean not null default true,
  is_core_role boolean not null default false, -- True for built-in roles
  features jsonb, -- Array of feature IDs available for this role
  department_access jsonb, -- Array of departments this role can access
  max_projects integer, -- Null = unlimited
  metadata jsonb, -- Additional custom metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  unique (tenant_id, role_key),
  unique (tenant_id, name)
);

-- Create PERMISSIONS table - Module-specific permissions
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_name text not null, -- e.g., 'projects', 'tasks', 'users'
  permission_key text not null, -- Unique identifier within module
  description text,
  is_core_permission boolean not null default false, -- True for built-in permissions
  created_at timestamptz not null default now(),
  unique (tenant_id, module_name, permission_key)
);

-- Create ROLE_PERMISSIONS junction table
-- Maps which permissions each role has
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  action public.permission_action not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, permission_id, action)
);

-- Create indexes for performance
create index if not exists roles_tenant_idx on public.roles(tenant_id);
create index if not exists roles_tenant_key_idx on public.roles(tenant_id, role_key);
create index if not exists roles_tenant_active_idx on public.roles(tenant_id, is_active);
create index if not exists roles_tenant_level_idx on public.roles(tenant_id, level);

create index if not exists permissions_tenant_idx on public.permissions(tenant_id);
create index if not exists permissions_tenant_module_idx on public.permissions(tenant_id, module_name);

create index if not exists role_permissions_tenant_idx on public.role_permissions(tenant_id);
create index if not exists role_permissions_role_idx on public.role_permissions(role_id);
create index if not exists role_permissions_permission_idx on public.role_permissions(permission_id);
create index if not exists role_permissions_action_idx on public.role_permissions(action);

-- Enable RLS
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

-- Create RLS policies
create policy roles_tenant_isolation on public.roles
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy permissions_tenant_isolation on public.permissions
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy role_permissions_tenant_isolation on public.role_permissions
  for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Insert core roles
do $$
declare
  v_tenant_id uuid;
begin
  -- Get the first tenant (usually the system tenant)
  select id into v_tenant_id from public.tenants limit 1;
  
  if v_tenant_id is not null then
    insert into public.roles (tenant_id, role_key, name, description, category, level, is_active, is_core_role, features)
    values
      (v_tenant_id, 'admin', 'Super Admin', 'Full control over the entire system. Manages users, roles, permissions, and system configuration.', 'administration'::public.role_category, 100, true, true, '["user_management", "role_management", "system_settings", "audit_logs", "backups", "integrations"]'::jsonb),
      (v_tenant_id, 'project_manager', 'Project Manager', 'Creates and manages projects, assigns tasks, tracks progress, and communicates with clients.', 'management'::public.role_category, 80, true, true, '["project_creation", "task_assignment", "progress_tracking", "client_communication", "reporting"]'::jsonb),
      (v_tenant_id, 'developer', 'Developer', 'Works on assigned tasks, updates status, uploads deliverables, and reports issues.', 'technical'::public.role_category, 60, true, true, '["code_repository", "task_management", "time_tracking", "issue_reporting", "documentation"]'::jsonb),
      (v_tenant_id, 'designer', 'UI/UX Designer', 'Uploads design files, works on UI/UX tasks, and collaborates with the development team.', 'creative'::public.role_category, 60, true, true, '["design_tools", "asset_management", "collaboration", "prototyping", "file_upload"]'::jsonb),
      (v_tenant_id, 'content_editor', 'Content Editor', 'Creates and edits website/app content, manages blogs, pages, and media.', 'content'::public.role_category, 55, true, true, '["content_management", "media_library", "seo_tools", "publishing", "scheduling"]'::jsonb),
      (v_tenant_id, 'qa_tester', 'QA Engineer', 'Tests features, reports issues, and verifies completed tasks before release.', 'quality'::public.role_category, 55, true, true, '["test_management", "bug_reporting", "test_automation", "quality_metrics", "release_verification"]'::jsonb),
      (v_tenant_id, 'client', 'Client', 'Views project progress, provides feedback, and approves milestones with limited access.', 'client'::public.role_category, 30, true, true, '["project_viewing", "progress_tracking", "feedback", "milestone_approval", "client_portal"]'::jsonb),
      (v_tenant_id, 'support_team', 'Support Team', 'Handles post-launch issues, manages updates, backups, and system health monitoring.', 'support'::public.role_category, 50, true, true, '["incident_management", "system_monitoring", "maintenance", "backup_management", "hot_fixes"]'::jsonb),
      (v_tenant_id, 'devops_engineer', 'DevOps Engineer', 'Manages deployment, CI/CD pipelines, infrastructure, and server operations.', 'technical'::public.role_category, 70, true, true, '["deployment", "ci_cd", "infrastructure", "monitoring", "system_administration"]'::jsonb),
      (v_tenant_id, 'business_analyst', 'Business Analyst', 'Gathers requirements, conducts analysis, and provides business insights.', 'business'::public.role_category, 65, true, true, '["requirement_gathering", "analysis", "reporting", "stakeholder_management", "documentation"]'::jsonb),
      (v_tenant_id, 'finance_admin', 'Finance Admin', 'Manages invoices, billing, payments, and financial records.', 'business'::public.role_category, 65, true, true, '["invoicing", "billing", "payments", "financial_reports", "expense_management"]'::jsonb)
    on conflict (tenant_id, role_key) do nothing;
  end if;
end $$;

-- Insert core permissions (modules and their actions)
do $$
declare
  v_tenant_id uuid;
  v_modules text[] := array['dashboard', 'projects', 'tasks', 'team', 'clients', 'content', 'finance', 'reports', 'settings', 'users', 'attendance', 'leaves', 'tickets', 'reimbursements'];
  v_module text;
begin
  select id into v_tenant_id from public.tenants limit 1;
  
  if v_tenant_id is not null then
    foreach v_module in array v_modules loop
      insert into public.permissions (tenant_id, module_name, permission_key, is_core_permission)
      values
        (v_tenant_id, v_module, v_module || '_read', true),
        (v_tenant_id, v_module, v_module || '_create', true),
        (v_tenant_id, v_module, v_module || '_update', true),
        (v_tenant_id, v_module, v_module || '_delete', true),
        (v_tenant_id, v_module, v_module || '_approve', true),
        (v_tenant_id, v_module, v_module || '_export', true)
      on conflict (tenant_id, module_name, permission_key) do nothing;
    end loop;
  end if;
end $$;

-- Grant necessary permissions to admin role
do $$
declare
  v_tenant_id uuid;
  v_role_id uuid;
  v_perm_id uuid;
begin
  select id into v_tenant_id from public.tenants limit 1;
  
  if v_tenant_id is not null then
    select id into v_role_id from public.roles where tenant_id = v_tenant_id and role_key = 'admin' limit 1;
    
    if v_role_id is not null then
      insert into public.role_permissions (tenant_id, role_id, permission_id, action)
      select v_tenant_id, v_role_id, id, action::public.permission_action
      from public.permissions
      cross join (select 'create'::public.permission_action as action union all select 'read' union all select 'update' union all select 'delete' union all select 'approve' union all select 'export')
      where permissions.tenant_id = v_tenant_id
      on conflict (tenant_id, role_id, permission_id, action) do nothing;
    end if;
  end if;
end $$;

-- Create trigger to update updated_at timestamp
create or replace function public.update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger roles_update_timestamp
before update on public.roles
for each row
execute function update_timestamp();

create trigger permissions_update_timestamp
before update on public.permissions
for each row
execute function update_timestamp();

create trigger role_permissions_update_timestamp
before update on public.role_permissions
for each row
execute function update_timestamp();
