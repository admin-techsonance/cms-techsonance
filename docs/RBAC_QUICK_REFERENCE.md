# RBAC Quick Reference Guide

## File Locations

### Core RBAC Types & Definitions
- **Types:** [src/lib/rbac/types.ts](../src/lib/rbac/types.ts)
- **Roles:** [src/lib/rbac/roles.ts](../src/lib/rbac/roles.ts)
- **Utilities:** [src/lib/rbac/utils.ts](../src/lib/rbac/utils.ts)
- **Index:** [src/lib/rbac/index.ts](../src/lib/rbac/index.ts)

### Server-Side RBAC
- **Database Service:** [src/server/rbac/service.ts](../src/server/rbac/service.ts)
- **Route Middleware:** [src/server/rbac/middleware.ts](../src/server/rbac/middleware.ts)

### API Routes
- **Roles API:** [src/app/api/rbac/roles/route.ts](../src/app/api/rbac/roles/route.ts)
- **Permissions API:** [src/app/api/rbac/permissions/route.ts](../src/app/api/rbac/permissions/route.ts)

### Database
- **Migration:** [supabase/migrations/20260415_rbac_centralized.sql](../supabase/migrations/20260415_rbac_centralized.sql)

## Core Roles at a Glance

| Role | Level | Key | Category | Primary Responsibility |
|------|-------|-----|----------|----------------------|
| Super Admin | 100 | `admin` | Administration | Full system control |
| Project Manager | 80 | `project_manager` | Management | Project management |
| DevOps Engineer | 70 | `devops_engineer` | Technical | Infrastructure & deployment |
| Business Analyst | 65 | `business_analyst` | Business | Requirement gathering |
| Finance Admin | 65 | `finance_admin` | Business | Financial management |
| Developer | 60 | `developer` | Technical | Development tasks |
| Designer | 60 | `designer` | Creative | UI/UX design |
| Content Editor | 55 | `content_editor` | Content | Content management |
| QA Engineer | 55 | `qa_tester` | Quality | Testing & QA |
| Support Team | 50 | `support_team` | Support | Post-launch support |
| Client | 30 | `client` | Client | Project viewing & feedback |

## Common Code Snippets

### Check Permission (Client)
```typescript
import { hasPermission } from '@/lib/rbac';

if (hasPermission('developer', 'tasks', 'update')) {
  // Show update button
}
```

### Protect API Route (Server)
```typescript
import { protectRoute } from '@/server/rbac/middleware';

export async function POST(request: Request) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    allowedRoles: ['Admin', 'Manager'],
  });

  if (!protection.authenticated) {
    return protection.errorResponse;
  }

  // Safe to proceed
}
```

### Check Module Permission
```typescript
import { hasPermission } from '@/lib/rbac';

const canCreate = hasPermission(userRole, 'projects', 'create');
const canRead = hasPermission(userRole, 'finance', 'read');
const canApprove = hasPermission(userRole, 'tasks', 'approve');
```

### Get Role Information
```typescript
import {
  getRoleName,
  getRoleDescription,
  getFeatures,
  getRoleCategory,
  getRoleLevel,
} from '@/lib/rbac';

const name = getRoleName('developer');
const level = getRoleLevel('developer');
const features = getFeatures('project_manager');
```

### Fetch from Database
```typescript
import { fetchRoles, fetchRolePermissions } from '@/server/rbac/service';

// In API route
const supabase = getRouteSupabase(auth.accessToken);
const roles = await fetchRoles(supabase, tenantId);
```

### Check Role Hierarchy
```typescript
import { canManageRole } from '@/server/rbac/middleware';

if (canManageRole('Admin', 'Developer')) {
  // Admin can manage Developer
}
```

### Filter Accessible Modules
```typescript
import { getAccessibleModules } from '@/lib/rbac';

const modules = getAccessibleModules('project_manager');
// Returns: ['dashboard', 'projects', 'tasks', ...]
```

## Module Permissions Reference

### All Available Modules

```
dashboard    - System overview and analytics
projects     - Project management and planning
tasks        - Task management and tracking
team         - Team/employee management
clients      - Client management
content      - Pages, blogs, media management
finance      - Invoices, payments, expenses
reports      - Business and system reports
settings     - System configuration
users        - User account management
attendance   - Attendance tracking
leaves       - Leave request management
tickets      - Support ticket management
reimbursements - Reimbursement requests
```

## Permission Actions

Each module supports these actions:

- **create** - Create new records
- **read** - View records
- **update** - Modify existing records
- **delete** - Remove records
- **approve** - Approve workflows/requests
- **export** - Export data

## Database Schema Quick Look

### roles table
- Stores role definitions
- Contains level, category, features
- Supports custom metadata

### permissions table
- Stores available permissions
- Grouped by module_name
- Marked as core or custom

### role_permissions table
- Links roles to permissions
- Specifies allowed actions
- Enforces unique constraints

## API Response Examples

### GET /api/rbac/roles
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "role_key": "developer",
      "name": "Developer",
      "level": 60,
      "permissions": {
        "tasks": {
          "create": true,
          "read": true,
          "update": true,
          "delete": false
        }
      }
    }
  ]
}
```

### GET /api/rbac/permissions
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "uuid",
        "module_name": "projects",
        "permission_key": "projects_read",
        "is_core_permission": true
      }
    ]
  }
}
```

## Environment Setup

### Create Migration
```bash
supabase migration new rbac_centralized
```

### Apply Migration
```bash
supabase db push
```

### Clear Cache
```typescript
import { clearRBACCache } from '@/server/rbac/service';

clearRBACCache(tenantId);
```

## Testing Roles

### Test with Different Roles
```typescript
// Import test utilities
import { hasPermission, getRolePermissions } from '@/lib/rbac';

// Test each role
const roles = ['admin', 'developer', 'client'];
roles.forEach(role => {
  console.log(`${role}:`, getRolePermissions(role));
});
```

### Manual API Testing
```bash
# Get all roles (requires Admin role)
curl -H "Authorization: Bearer TOKEN" \
  https://yourdomain.com/api/rbac/roles

# Get all permissions
curl -H "Authorization: Bearer TOKEN" \
  https://yourdomain.com/api/rbac/permissions
```

## Caching

### Automatic Cache
- Roles cached for 5 minutes
- Permissions cached for 5 minutes
- Tenant-specific isolation

### Manual Cache Clear
```typescript
import { clearRBACCache, clearAllRBACCaches } from '@/server/rbac/service';

// Clear specific tenant
clearRBACCache('tenant-id');

// Clear all
clearAllRBACCaches();
```

## Common Issues & Solutions

### User Can't Access Module
1. Check role is `is_active = true`
2. Verify `role_permissions` entries exist
3. Ensure permission `action` matches exactly
4. Clear cache: `clearRBACCache(tenantId)`

### Permission Check Always Returns False
1. Verify user's role in database
2. Check module name matches exactly (case-sensitive)
3. Verify `permission_key` format
4. Test with Admin role as control

### Cache Not Updating
- Clear cache: `clearRBACCache(tenantId)`
- Or wait 5 minutes for automatic refresh

## Integration Checklist

- [ ] Database migration applied
- [ ] RBAC types imported in components
- [ ] API routes protected with `protectRoute()`
- [ ] Client-side checks use `hasPermission()`
- [ ] Role definitions match requirements
- [ ] Cache strategy implemented
- [ ] Tested with different roles
- [ ] Error handling for permission denied
- [ ] Audit logging for role changes
- [ ] Documentation updated

## Support

For detailed documentation, see: [RBAC_SYSTEM.md](./RBAC_SYSTEM.md)
