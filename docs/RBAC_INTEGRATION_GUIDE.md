# RBAC Integration Guide

## Getting Started

This guide walks you through integrating the centralized RBAC system into your CMS application.

## Prerequisites

- Supabase project configured
- Access to database
- Next.js application running
- Node.js 16+ installed

## Step 1: Apply Database Migration

The first step is to create the RBAC tables in your Supabase database.

```bash
# Navigate to project directory
cd /Users/techsonanceinfotechllp/Documents/CodeBase/cms-techsonance

# Push migration to Supabase
supabase db push

# Or manually run the migration SQL in Supabase dashboard
# File: supabase/migrations/20260415_rbac_centralized.sql
```

### Verify Migration Success

1. Log into Supabase Dashboard
2. Go to SQL Editor
3. Run this query to verify tables:
   ```sql
   SELECT count(*) FROM roles WHERE is_core_role = true;
   SELECT count(*) FROM permissions;
   SELECT count(*) FROM role_permissions;
   ```
4. You should see:
   - 11 roles (core roles)
   - 84 permissions (14 modules × 6 actions)
   - Many role_permissions entries

## Step 2: Import RBAC Utilities

### Client-Side (React Components)

```typescript
// In your component
import { hasPermission, getRoleName } from '@/lib/rbac';

export function ProjectList({ userRole }) {
  // Check if user can create projects
  if (!hasPermission(userRole, 'projects', 'create')) {
    return <p>You don't have permission to create projects</p>;
  }

  return (
    <div>
      <h1>Projects</h1>
      <button>New Project</button>
    </div>
  );
}
```

### Server-Side (API Routes)

```typescript
// In your API route
import { protectRoute } from '@/server/rbac/middleware';
import { fetchRoles } from '@/server/rbac/service';

export async function POST(request: Request) {
  // Protect the route
  const protection = await protectRoute(request, {
    requireAuth: true,
    allowedRoles: ['Admin', 'Manager'],
    module: 'projects',
    action: 'create'
  });

  if (!protection.authenticated) {
    return protection.errorResponse;
  }

  // Now you have auth context
  const { auth } = protection;
  
  // Your handler code here
  return Response.json({ success: true });
}
```

## Step 3: Update Existing API Routes

For each existing API route, add RBAC protection:

### Before (Old System)
```typescript
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Basic check
  if (auth.user.role !== 'Manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // Handler code
}
```

### After (New RBAC System)
```typescript
export async function POST(request: Request) {
  // Single call replaces all auth/role checks
  const protection = await protectRoute(request, {
    requireAuth: true,
    allowedRoles: ['Admin', 'Manager'],
    module: 'projects',
    action: 'create'
  });

  if (!protection.authenticated) {
    return protection.errorResponse;
  }

  const { auth } = protection;
  
  // Handler code
}
```

## Step 4: Update React Components

### Show/Hide Buttons Based on Permissions

```typescript
import { hasPermission } from '@/lib/rbac';

export function TaskActions({ userRole }) {
  return (
    <div className="actions">
      {hasPermission(userRole, 'tasks', 'read') && (
        <button>View</button>
      )}
      
      {hasPermission(userRole, 'tasks', 'update') && (
        <button>Edit</button>
      )}
      
      {hasPermission(userRole, 'tasks', 'delete') && (
        <button>Delete</button>
      )}
      
      {hasPermission(userRole, 'tasks', 'approve') && (
        <button>Approve</button>
      )}
    </div>
  );
}
```

### Display Role Information

```typescript
import { getRoleName, getRoleDescription, getFeatures } from '@/lib/rbac';

export function RoleCard({ roleKey }) {
  return (
    <div className="card">
      <h2>{getRoleName(roleKey)}</h2>
      <p>{getRoleDescription(roleKey)}</p>
      <div>
        <strong>Features:</strong>
        <ul>
          {getFeatures(roleKey).map(feature => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

## Step 5: Create Role Assignment Logic

Create a component to assign roles to users:

```typescript
// pages/admin/users/[id]/edit.tsx
import { updateRole } from '@/server/rbac/service';
import { getAllRoles } from '@/lib/rbac';

export default function EditUser({ user }) {
  const roles = getAllRoles();

  async function handleRoleChange(newRole) {
    const response = await fetch(`/api/users/${user.id}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });

    if (response.ok) {
      // Refresh user data
    }
  }

  return (
    <div>
      <h1>Edit User: {user.name}</h1>
      <select 
        value={user.role}
        onChange={(e) => handleRoleChange(e.target.value)}
      >
        {roles.map(role => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </div>
  );
}
```

## Step 6: Test the Implementation

### Test API Endpoints

```bash
# Get all roles (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain/api/rbac/roles

# Get all permissions
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain/api/rbac/permissions
```

### Test with Different Roles

1. Create test users with different roles:
   - admin
   - project_manager
   - developer
   - client

2. Log in as each user and verify:
   - Correct dashboard displays
   - Correct buttons show/hide
   - API routes accept/reject appropriately

3. Test permission denial:
   - Try to access admin routes as developer
   - Verify proper error response

## Step 7: Troubleshooting

### Issue: Roles Not Loading

```typescript
// Clear cache and reload
import { clearRBACCache } from '@/server/rbac/service';

clearRBACCache(tenantId);

// Then refresh page
```

### Issue: Permission Check Always Returns False

1. Verify role exists: `SELECT * FROM roles WHERE role_key = 'developer';`
2. Check permission exists: `SELECT * FROM permissions WHERE module_name = 'tasks';`
3. Check assignment: `SELECT * FROM role_permissions WHERE role_id = '...';`

### Issue: API Route Doesn't Protect

Make sure `protectRoute()` is called:

```typescript
export async function POST(request: Request) {
  // ✅ CORRECT - Call protectRoute
  const protection = await protectRoute(request, { requireAuth: true });
  if (!protection.authenticated) return protection.errorResponse;

  // ❌ INCORRECT - Just checking auth won't give RBAC
  const auth = await authenticateRequest(request);
}
```

## Step 8: Advanced Usage

### Creating Custom Roles

```typescript
// In an admin API route
import { createRole, assignPermissionToRole } from '@/server/rbac/service';

export async function POST(request: Request) {
  const { roleName, category, level } = await request.json();

  // Create role
  const newRole = await createRole(supabase, tenantId, {
    role_key: roleName.toLowerCase(),
    name: roleName,
    category: category,
    level: level,
    features: ['feature1', 'feature2']
  });

  if (!newRole) {
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }

  // Assign permissions
  const modules = ['projects', 'tasks'];
  for (const module of modules) {
    const { data: permissions } = await supabase
      .from('permissions')
      .select('id')
      .eq('module_name', module);

    for (const perm of permissions) {
      await assignPermissionToRole(
        supabase,
        tenantId,
        newRole.id,
        perm.id,
        'read' // or 'create', 'update', etc.
      );
    }
  }

  return NextResponse.json({ success: true, data: newRole });
}
```

### Checking Role Hierarchy

```typescript
import { hasHigherLevel, getRoleLevel } from '@/lib/rbac';

// Check if manager has higher level than developer
if (hasHigherLevel('project_manager', 'developer')) {
  // Manager can manage developer
}

// Get numeric level for comparison
const adminLevel = getRoleLevel('admin'); // 100
const devLevel = getRoleLevel('developer'); // 60
```

### Role Comparison

```typescript
import { compareRoles } from '@/lib/rbac';

const comparison = compareRoles('admin', 'developer');
console.log(comparison);
// {
//   role1: { name: 'Super Admin', level: 100, features: [...] },
//   role2: { name: 'Developer', level: 60, features: [...] },
//   levelDifference: 40
// }
```

## Step 9: Monitoring and Maintenance

### Check Cache Performance

```typescript
// Monitor cache hits/misses
import { getPermissionSummary } from '@/lib/rbac';

// First call hits database
const summary1 = getPermissionSummary('developer');

// Subsequent calls use cache (within 5 minutes)
const summary2 = getPermissionSummary('developer');
```

### Clear Cache When Updating Roles

```typescript
import { clearRBACCache } from '@/server/rbac/service';

async function updateRolePermissions(tenantId, roleId, newPermissions) {
  // Update logic here
  
  // Clear cache so changes take effect immediately
  clearRBACCache(tenantId);
}
```

### Audit Role Changes

```typescript
// Add to your API route after updating roles
await supabase.from('audit_logs').insert({
  tenant_id: tenantId,
  action: 'role_updated',
  resource_type: 'roles',
  resource_id: roleId,
  user_id: auth.user.id,
  changes: { before, after }
});
```

## Step 10: Documentation for Your Team

Create internal docs:

1. **For Developers:**
   - Link to `docs/RBAC_QUICK_REFERENCE.md`
   - Show example code snippets
   - Document your custom roles

2. **For Admins:**
   - Link to permission matrix
   - Document how to assign roles
   - Create runbook for common issues

3. **For QA:**
   - Create test cases for each role
   - Document permission test scenarios
   - Setup test users

## Common Integration Patterns

### Pattern 1: Role-Based Dashboard

```typescript
import { getDashboardType } from '@/lib/rbac';

export function DashboardRouter({ userRole }) {
  const dashboardType = getDashboardType(userRole);
  
  return dashboardType === 'admin' 
    ? <AdminDashboard /> 
    : <EmployeeDashboard />;
}
```

### Pattern 2: Resource Ownership Check

```typescript
export async function PUT(request: Request) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    module: 'tasks',
    action: 'update'
  });

  if (!protection.authenticated) {
    return protection.errorResponse;
  }

  const { auth } = protection;
  const taskId = getTaskId(request);
  const task = await getTask(taskId);

  // Check ownership or admin
  if (task.assignedTo !== auth.user.id && !isAdmin(auth)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update logic
}
```

### Pattern 3: Cascading Permissions

```typescript
export function ModuleAccess({ userRole, module }) {
  const canRead = hasPermission(userRole, module, 'read');
  const canWrite = hasPermission(userRole, module, 'create') || 
                  hasPermission(userRole, module, 'update');
  const canDelete = hasPermission(userRole, module, 'delete');

  return (
    <div>
      {!canRead && <Locked />}
      {canRead && !canWrite && <ReadOnly />}
      {canRead && canWrite && !canDelete && <EditableNoDelete />}
      {canRead && canWrite && canDelete && <FullAccess />}
    </div>
  );
}
```

## Verification Checklist

- [ ] Database migration applied
- [ ] Core roles visible in database
- [ ] API endpoints working
- [ ] Client-side imports working
- [ ] Server-side imports working
- [ ] Components show/hide correctly
- [ ] API routes protected correctly
- [ ] Different roles have different access
- [ ] Cache working (5-minute TTL)
- [ ] Permission checks accurate
- [ ] Error messages clear
- [ ] Performance acceptable

## Next Resources

- Read: `docs/RBAC_SYSTEM.md` for deep dive
- Reference: `docs/RBAC_QUICK_REFERENCE.md` for quick lookups
- Matrix: `docs/RBAC_PERMISSION_MATRIX.md` for permission overview
- Code: `src/lib/rbac/` for implementation details

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the permission matrix
3. Verify database migration applied
4. Check auth context is correct
5. Clear cache if recent changes
6. Test with Admin role to rule out permission issues

---

**Last Updated:** April 15, 2026
**Status:** Ready for Integration
