# RBAC System Integration - Action Plan

## Overview
The centralized RBAC system is now ready for integration into existing API routes. This document provides:
1. Current state analysis
2. Integration strategy
3. Migration plan
4. Testing approach

## Phase 1: Foundation Complete ✅

All core components are now in place:

- **src/lib/rbac/types.ts** - Type system for 11 roles and 14 modules
- **src/lib/rbac/roles.ts** - Role definitions with permission matrices
- **src/lib/rbac/utils.ts** - Client-side permission utilities
- **src/server/rbac/service.ts** - Database service layer
- **src/server/rbac/middleware.ts** - Route protection utilities
- **src/server/rbac/mapper.ts** - Backward compatibility mapping (NEW)
- **src/server/rbac/auth-integration.ts** - Enhanced permission checking (NEW)
- **supabase/migrations/20260415_rbac_centralized.sql** - Database schema
- **docs/RBAC_SYSTEM.md** - Comprehensive documentation
- **docs/RBAC_INTEGRATION_EXAMPLES.ts** - Integration patterns (NEW)

## Phase 2: Integration into Existing Routes 🔄

### Current State

**50+ API routes using role validation:**
```
Pattern: withApiHandler(handler, { requireAuth: true, roles: ['Employee'] })

Existing routes:
- src/app/api/users/route.ts
- src/app/api/employees/route.ts
- src/app/api/clients/route.ts
- src/app/api/projects/route.ts
- src/app/api/tasks/route.ts
- src/app/api/invoices/route.ts
- src/app/api/expenses/route.ts
- src/app/api/attendance/route.ts
- src/app/api/leave-requests/route.ts
- src/app/api/tickets/route.ts
- src/app/api/notifications/route.ts
- src/app/api/activity-logs/route.ts
- src/app/api/chat-messages/route.ts
- src/app/api/upload/route.ts
- src/app/api/inquiries/route.ts
- ... and 35+ more
```

### Integration Approach

**Strategy: Layered Integration**

1. **Layer 1 (Immediate)**: New RBAC functions available for use in handlers
   - Existing routes continue to work with AppRole validation
   - New handlers can opt-in to granular module/action checking
   - No breaking changes

2. **Layer 2 (After DB Migration)**: Enhance authenticateRequest()
   - Optional flag to enable new RBAC database checking
   - Parallel validation with AppRole
   - Gradual route migration

3. **Layer 3 (Future)**: Complete migration
   - All routes use module/action validation
   - AppRole validation deprecated
   - Full permission matrix in use

### Quick Integration Steps

**For any existing route handler:**

```typescript
import { enforceRBACPermission, hasRBACPermission } from '@/server/rbac/auth-integration';

// Enforcement approach (throws on denied)
export async function DELETE(request: Request, context: HandlerContext) {
  const { auth } = context;
  enforceRBACPermission(auth, 'users', 'delete');
  // ... rest of handler
}

// Conditional approach (check before proceeding)
export async function PATCH(request: Request, context: HandlerContext) {
  const { auth } = context;
  if (!hasRBACPermission(auth, 'users', 'update')) {
    return errorResponse('Cannot update users', 403);
  }
  // ... rest of handler
}
```

## Phase 3: New RBAC Functions Available

### Available Functions

**Import from: `@/server/rbac/auth-integration`**

```typescript
// Synchronous permission checking
hasRBACPermission(auth, module, action): boolean
hasAnyRBACPermissions(auth, checks[]): boolean
hasAllRBACPermissions(auth, checks[]): boolean
enforceRBACPermission(auth, module, action): void
```

### Supported Modules

```typescript
type ModuleKey = 
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'team'
  | 'clients'
  | 'content'
  | 'finance'
  | 'reports'
  | 'settings'
  | 'users'
  | 'attendance'
  | 'leaves'
  | 'tickets'
  | 'reimbursements';

type ActionKey = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'export';
```

### Permission Matrix by Role

```
Admin (SuperAdmin)
├── All modules: create, read, update, delete, approve, export ✅

ProjectManager (Manager)
├── Projects: full CRUD + approve
├── Tasks: full CRUD + approve
├── Team: read, update, approve
├── Finance: read, approve
├── Reports: read, export
└── (Others: read-only or denied)

Developer (Employee)
├── Tasks: create, read, update (own only)
├── Projects: read, update (assigned only)
├── Attendance: create (own), read
├── Leave requests: create, read
└── (Most other modules: read-only)

Client (Viewer)
├── Projects: read (assigned only)
├── Tasks: read (assigned only)
├── Content: read
└── (Restricted to client portal features)

SupportTeam
├── Tickets: read, update, create
├── Clients: read
├── Reports: read
└── (Limited to support functions)

... and more specific role permissions
```

## Phase 4: Testing Strategy

### Test Cases

**1. Permission Enforcement**
```typescript
test('Admin can delete users', async () => {
  const adminAuth = { user: { role: 'SuperAdmin' }, ... };
  enforceRBACPermission(adminAuth, 'users', 'delete');
  // Should not throw
});

test('Employee cannot delete users', async () => {
  const empAuth = { user: { role: 'Employee' }, ... };
  expect(() => 
    enforceRBACPermission(empAuth, 'users', 'delete')
  ).toThrow();
});
```

**2. Module Access**
```typescript
test('ProjectManager can approve invoices', async () => {
  const pmAuth = { user: { role: 'Manager' }, ... };
  const canApprove = hasRBACPermission(pmAuth, 'finance', 'approve');
  expect(canApprove).toBe(true);
});
```

**3. Multiple Permissions**
```typescript
test('Check multiple permissions', async () => {
  const auth = { user: { role: 'SuperAdmin' }, ... };
  const hasAll = hasAllRBACPermissions(auth, [
    { module: 'users', action: 'delete' },
    { module: 'projects', action: 'create' },
  ]);
  expect(hasAll).toBe(true);
});
```

## Phase 5: Backward Compatibility

### Existing Routes Continue to Work

All current routes using `{ requireAuth: true, roles: ['Admin'] }` continue to work unchanged:

- AppRole validation happens in `authenticateRequest()`
- New RBAC is additive, not replacement
- No breaking changes to existing code

### Migration Path

**Old way (still works):**
```typescript
withApiHandler(handler, { requireAuth: true, roles: ['Admin'] })
```

**New way (recommended for new code):**
```typescript
export async function DELETE(request: Request, context: HandlerContext) {
  enforceRBACPermission(context.auth, 'users', 'delete');
  // ... handler logic
}
```

## Phase 6: Recommended Priorities

### High Priority Routes (Update First)
1. User/Employee management (`src/app/api/users/**`)
2. Project management (`src/app/api/projects/**`)
3. Financial operations (`src/app/api/invoices/**`, `src/app/api/expenses/**`)
4. Leave/Attendance (`src/app/api/attendance/**`, `src/app/api/leave-requests/**`)

### Medium Priority Routes
1. Client management (`src/app/api/clients/**`)
2. Task management (`src/app/api/tasks/**`)
3. Content management (`src/app/api/content/**`)
4. Support tickets (`src/app/api/tickets/**`)

### Lower Priority Routes
1. Notifications (`src/app/api/notifications/**`)
2. Chat (`src/app/api/chat-messages/**`)
3. Uploads (`src/app/api/upload/**`)
4. Activity logs (`src/app/api/activity-logs/**`)

## Phase 7: Next Steps

### Immediate (Today)
- ✅ Review this document
- ✅ Understand new functions
- ✅ Identify first route to update

### Short-term (This week)
- [ ] Update 3-5 high-priority routes
- [ ] Test new permission checking
- [ ] Verify no breaking changes
- [ ] Document any issues

### Medium-term (This sprint)
- [ ] Update remaining routes systematically
- [ ] Create test suite for RBAC
- [ ] Update API documentation
- [ ] Team training on new system

### Long-term (After successful integration)
- [ ] Apply database migration
- [ ] Integrate database-based permissions
- [ ] Full module/action validation
- [ ] Deprecate AppRole-only validation

## Files to Update

### Priority 1 (Core Functions)
```
src/app/api/users/route.ts
src/app/api/employees/route.ts
src/app/api/projects/route.ts
src/app/api/tasks/route.ts
```

### Priority 2 (Business Logic)
```
src/app/api/invoices/route.ts
src/app/api/expenses/route.ts
src/app/api/attendance/route.ts
src/app/api/leave-requests/route.ts
src/app/api/clients/route.ts
```

### Priority 3 (Support Functions)
```
src/app/api/tickets/route.ts
src/app/api/notifications/route.ts
src/app/api/chat-messages/route.ts
src/app/api/upload/route.ts
src/app/api/inquiries/route.ts
```

## Validation Checklist

Before updating each route:
- [ ] Understand current role requirements
- [ ] Map to appropriate module/action
- [ ] Add RBAC permission check
- [ ] Test with different roles
- [ ] Verify error handling
- [ ] Update documentation
- [ ] Code review with team

## Questions & Support

**What's the difference between AppRole and the new RBAC?**
- AppRole: Legacy system with 5 roles (SuperAdmin, Admin, Manager, Employee, Viewer)
- New RBAC: Comprehensive system with 11 roles and module/action permissions
- Mapper: Automatically converts between them

**Do I need to update all routes immediately?**
- No! New system is optional and works alongside existing validation
- Gradual migration is recommended
- Start with high-priority routes

**What happens if I use both systems?**
- Both will work and provide defense-in-depth
- AppRole validation happens first (in authenticateRequest)
- RBAC module/action checks happen in handler
- User must pass both checks to succeed

**How do I test the new system?**
- Use enforceRBACPermission() with mock auth objects
- Create test cases for each role and module combination
- Test permission denied scenarios
- Test multiple permission checks

## Resources

- **Main Documentation**: [RBAC_SYSTEM.md](./RBAC_SYSTEM.md)
- **Quick Reference**: [RBAC_QUICK_REFERENCE.md](./RBAC_QUICK_REFERENCE.md)
- **Permission Matrix**: [RBAC_PERMISSION_MATRIX.md](./RBAC_PERMISSION_MATRIX.md)
- **Integration Examples**: [RBAC_INTEGRATION_EXAMPLES.ts](./RBAC_INTEGRATION_EXAMPLES.ts)
- **Type Definitions**: [src/lib/rbac/types.ts](../src/lib/rbac/types.ts)
- **Auth Integration**: [src/server/rbac/auth-integration.ts](../src/server/rbac/auth-integration.ts)
