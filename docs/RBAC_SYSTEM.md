# Centralized RBAC (Role-Based Access Control) System

## Overview

This document outlines the comprehensive centralized RBAC system implemented for the CMS Portal. The system provides a complete role and permission management solution with support for 8 core roles and 3 optional advanced roles.

## Architecture

The RBAC system is built on three layers:

1. **Database Layer** - Supabase tables storing roles, permissions, and assignments
2. **Service Layer** - Functions to fetch and manage roles/permissions from the database
3. **Application Layer** - Client-side and server-side utilities for permission checks

### Directory Structure

```
src/
├── lib/
│   └── rbac/
│       ├── index.ts              # Main export
│       ├── types.ts              # Type definitions
│       └── roles.ts              # Role definitions and permissions matrix
│       └── utils.ts              # Utility functions for permission checks
├── server/
│   └── rbac/
│       ├── service.ts            # Database service for RBAC
│       └── middleware.ts         # Route protection middleware
└── app/
    └── api/
        └── rbac/
            ├── roles/route.ts    # GET /api/rbac/roles
            └── permissions/route.ts # GET /api/rbac/permissions

supabase/migrations/
└── 20260415_rbac_centralized.sql # Database migration
```

## Core Roles

### 1. Admin (Super Admin) - Level 100
- **Key:** `admin`
- **Category:** Administration
- **Responsibilities:**
  - Full control over the entire system
  - Manages users, roles, and permissions
  - Approves/rejects content and workflows
  - Configures system settings
- **Permissions:** Full access to all modules
- **Features:**
  - User management
  - Role management
  - System settings
  - Audit logs
  - Backups
  - Integrations

### 2. Project Manager - Level 80
- **Key:** `project_manager`
- **Category:** Management
- **Responsibilities:**
  - Creates and manages projects
  - Assigns tasks to developers/designers
  - Tracks progress, deadlines, and deliverables
  - Communicates with clients
- **Full Access Modules:**
  - Dashboard
  - Projects
  - Tasks
- **Features:**
  - Project creation
  - Task assignment
  - Progress tracking
  - Client communication
  - Reporting

### 3. Developer - Level 60
- **Key:** `developer`
- **Category:** Technical
- **Responsibilities:**
  - Works on assigned tasks (frontend/backend)
  - Updates task status
  - Uploads code, documentation, or deliverables
  - Reports bugs/issues
- **Full Access Modules:**
  - Tasks
- **Features:**
  - Code repository
  - Task management
  - Time tracking
  - Issue reporting
  - Documentation

### 4. Designer (UI/UX) - Level 60
- **Key:** `designer`
- **Category:** Creative
- **Responsibilities:**
  - Uploads design files (Figma, images, etc.)
  - Works on UI/UX tasks
  - Collaborates with developers
- **Full Access Modules:**
  - Tasks
  - Content (read, create, update)
- **Features:**
  - Design tools
  - Asset management
  - Collaboration
  - Prototyping
  - File upload

### 5. Content Editor - Level 55
- **Key:** `content_editor`
- **Category:** Content
- **Responsibilities:**
  - Creates and edits website/app content
  - Manages blog posts, pages, media
  - Ensures content quality and SEO
- **Full Access Modules:**
  - Content
- **Features:**
  - Content management
  - Media library
  - SEO tools
  - Publishing
  - Scheduling

### 6. QA Engineer - Level 55
- **Key:** `qa_tester`
- **Category:** Quality
- **Responsibilities:**
  - Tests features and bug fixes
  - Reports issues
  - Verifies completed tasks before release
- **Full Access Modules:**
  - Tasks
- **Features:**
  - Test management
  - Bug reporting
  - Test automation
  - Quality metrics
  - Release verification

### 7. Client/Customer - Level 30
- **Key:** `client`
- **Category:** Client
- **Responsibilities:**
  - Views project progress
  - Gives feedback
  - Approves milestones or deliverables
  - Limited access (read/comment mostly)
- **Read Access Modules:**
  - Dashboard
  - Projects
  - Tasks
  - Finance
  - Reports
- **Features:**
  - Project viewing
  - Progress tracking
  - Feedback
  - Milestone approval
  - Client portal

### 8. Support/Maintenance Team - Level 50
- **Key:** `support_team`
- **Category:** Support
- **Responsibilities:**
  - Handles post-launch issues
  - Manages updates, backups, and fixes
  - Monitors system health
- **Features:**
  - Incident management
  - System monitoring
  - Maintenance
  - Backup management
  - Hot fixes

## Advanced Optional Roles

### 9. DevOps Engineer - Level 70
- **Key:** `devops_engineer`
- **Deployment, CI/CD, infrastructure management**

### 10. Business Analyst - Level 65
- **Key:** `business_analyst`
- **Requirement gathering and analysis**

### 11. Finance Admin - Level 65
- **Key:** `finance_admin`
- **Invoices, billing, payments management**

## Permission Model

### Modules

The system controls access to 14 core modules:

1. **dashboard** - System overview and analytics
2. **projects** - Project management
3. **tasks** - Task management and tracking
4. **team** - Team/employee management
5. **clients** - Client management
6. **content** - Pages, blogs, media management
7. **finance** - Invoices, payments, expenses
8. **reports** - System and business reports
9. **settings** - System configuration
10. **users** - User account management
11. **attendance** - Attendance tracking
12. **leaves** - Leave request management
13. **tickets** - Support ticket management
14. **reimbursements** - Reimbursement requests

### Actions (CRUD + Approval/Export)

For each module, the following actions can be controlled:

- **create** - Create new records
- **read** - View records
- **update** - Modify existing records
- **delete** - Remove records
- **approve** - Approve requests or workflows
- **export** - Export data

## Usage

### 1. Check Permissions (Client-Side)

```typescript
import { hasPermission, checkPermission } from '@/lib/rbac';

// Simple check
if (hasPermission('developer', 'tasks', 'update')) {
  // Allow task update
}

// Detailed check with context
const result = checkPermission({
  userRole: 'developer',
  module: 'tasks',
  action: 'create',
  userId: 'user-123',
});

if (result.allowed) {
  // Proceed
}
```

### 2. Protect API Routes (Server-Side)

```typescript
import { protectRoute } from '@/server/rbac/middleware';

export async function POST(request: Request) {
  // Protect route
  const protection = await protectRoute(request, {
    requireAuth: true,
    allowedRoles: ['Admin', 'Manager'],
    module: 'projects',
    action: 'create',
  });

  if (!protection.authenticated) {
    return protection.errorResponse;
  }

  const { auth } = protection;
  // Proceed with handler using auth context
}
```

### 3. Fetch Roles and Permissions

```typescript
import { fetchRoles, fetchRolePermissions } from '@/server/rbac/service';

// In API route
const supabase = getRouteSupabase(accessToken);
const roles = await fetchRoles(supabase, tenantId);
const permissions = await fetchRolePermissions(supabase, tenantId, roleId);
```

### 4. Get Role Information

```typescript
import {
  getRoleName,
  getRoleDescription,
  getFeatures,
  getRoleCategory,
} from '@/lib/rbac';

const roleName = getRoleName('project_manager'); // "Project Manager"
const description = getRoleDescription('project_manager');
const features = getFeatures('project_manager');
const category = getRoleCategory('project_manager'); // "management"
```

## Database Schema

### roles table

```sql
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL,           -- e.g., 'admin', 'developer'
  name text NOT NULL,               -- Display name
  description text,
  category public.role_category NOT NULL,
  level integer NOT NULL DEFAULT 0, -- Hierarchy level
  is_active boolean NOT NULL DEFAULT true,
  is_core_role boolean NOT NULL DEFAULT false,
  features jsonb,                   -- Array of feature IDs
  department_access jsonb,          -- Accessible departments
  max_projects integer,             -- Limit for projects (null = unlimited)
  metadata jsonb,                   -- Custom metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
```

### permissions table

```sql
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_name text NOT NULL,        -- e.g., 'projects', 'tasks'
  permission_key text NOT NULL,     -- Unique identifier
  description text,
  is_core_permission boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### role_permissions table

```sql
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  action public.permission_action NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## API Endpoints

### GET /api/rbac/roles
Fetch all roles with their permissions
- **Auth Required:** Yes
- **Min Role:** Admin
- **Returns:** Array of role definitions with permissions

### GET /api/rbac/permissions
Fetch all permissions grouped by module
- **Auth Required:** Yes
- **Min Role:** Admin
- **Returns:** Object with modules as keys

## Migration Guide

### From Old System to New RBAC

1. **Run Migration:**
   ```bash
   supabase migration up
   ```

2. **Verify Core Roles Created:**
   - The migration automatically creates all 11 core roles
   - All 14 module permissions are created
   - Admin role is granted full access

3. **Update Application Code:**
   - Replace old permission checks with new RBAC system
   - Use `protectRoute()` for API route protection
   - Use `hasPermission()` for UI permission checks

4. **Test Role Access:**
   - Verify each role has expected permissions
   - Test API routes with different roles
   - Check UI displays correctly for each role

## Caching Strategy

The system implements in-memory caching with 5-minute TTL:

- **Role Cache:** Stores all roles for a tenant
- **Permission Cache:** Stores permissions for each role
- **Cache Invalidation:** Automatic on updates via `clearRBACCache()`

```typescript
import { clearRBACCache } from '@/server/rbac/service';

// Invalidate cache after role changes
clearRBACCache(tenantId);
```

## Role Hierarchy

Roles follow a hierarchy system where higher-level roles have more permissions:

```
Admin (100)
├── Project Manager (80)
├── DevOps Engineer (70)
├── Business Analyst (65)
├── Finance Admin (65)
├── Developer (60)
├── Designer (60)
├── Content Editor (55)
├── QA Engineer (55)
├── Support Team (50)
└── Client (30)
```

## Best Practices

1. **Always Protect API Routes:**
   ```typescript
   const protection = await protectRoute(request, options);
   if (!protection.authenticated) return protection.errorResponse;
   ```

2. **Use Role Keys (Strings) for Storage:**
   - Store `'developer'` instead of role objects
   - Allows easy role lookups from database

3. **Cache Role Checks:**
   - Use fallback role definitions for quick checks
   - Database calls are cached for 5 minutes

4. **Validate Permissions Server-Side:**
   - Never trust client-side permission checks
   - Always validate on the server before operations

5. **Audit Role Changes:**
   - Log all role modifications
   - Track who created/updated roles

## Extending the System

### Adding a New Role

1. **Define in Database:**
   ```sql
   INSERT INTO roles (tenant_id, role_key, name, category, level)
   VALUES ('tenant-id', 'new_role', 'New Role', 'category', 50);
   ```

2. **Add Type Definition:**
   ```typescript
   export type UserRole = CoreRole | AdvancedRole | 'new_role';
   ```

3. **Add Permissions:**
   ```typescript
   assignPermissionToRole(supabase, tenantId, roleId, permissionId, 'read');
   ```

### Adding a New Module

1. **Create Permissions:**
   ```sql
   INSERT INTO permissions (tenant_id, module_name, permission_key)
   VALUES ('tenant-id', 'new_module', 'new_module_read'),
          ('tenant-id', 'new_module', 'new_module_create'),
          ...
   ```

2. **Update Type:**
   ```typescript
   export interface ModulePermissions {
     new_module: CRUDPermission;
     // ... other modules
   }
   ```

3. **Assign to Roles:**
   ```typescript
   assignPermissionToRole(supabase, tenantId, roleId, permissionId, 'read');
   ```

## Troubleshooting

### User Can't Access Module

1. Check role is active: `is_active = true`
2. Verify role_permissions records exist
3. Check permission module_name matches exactly
4. Clear cache: `clearRBACCache(tenantId)`

### Cache Issues

```typescript
// Clear specific tenant cache
clearRBACCache(tenantId);

// Clear all caches
clearAllRBACCaches();
```

### Permission Denied

1. Verify user's role in database
2. Check role_permissions assignments
3. Ensure action matches exactly ('create', 'read', etc.)
4. Test with Admin role to rule out permission issues
