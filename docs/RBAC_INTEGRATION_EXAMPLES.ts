/**
 * RBAC Integration Guide
 * 
 * This guide shows how to integrate the new centralized RBAC system
 * into existing API routes using the new auth-integration module.
 */

// ============================================================================
// PATTERN 1: Basic Role Validation (existing way)
// ============================================================================
// Current pattern in existing routes:
// withApiHandler(handler, { requireAuth: true, roles: ['Admin', 'Manager'] })

// This already validates roles at the handler level via authenticateRequest()
// No changes needed - it continues to work!

// ============================================================================
// PATTERN 2: Module-based Permission Checking (NEW)
// ============================================================================
// For fine-grained control beyond just AppRole, use:

import { enforceRBACPermission } from '@/server/rbac/auth-integration';
import type { ModulePermissions } from '@/lib/rbac/types';

// Example: In a DELETE handler that removes a user
export async function deleteUserHandler(request: Request, context: any) {
  const auth = context.auth; // Already authenticated by withApiHandler
  
  // Check if user has delete permission for 'users' module
  enforceRBACPermission(auth, 'users', 'delete');
  
  // ... rest of handler
  return new Response(JSON.stringify({ success: true }));
}

// ============================================================================
// PATTERN 3: Conditional Permission Checking
// ============================================================================

import { hasRBACPermission, hasAllRBACPermissions } from '@/server/rbac/auth-integration';

// Example: Feature availability based on permissions
export async function complexFeatureHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Check if user can both update and delete projects
  if (hasAllRBACPermissions(auth, [
    { module: 'projects', action: 'update' },
    { module: 'projects', action: 'delete' }
  ])) {
    // Enable advanced project management features
  }
  
  // Or check if user has ANY export permissions
  if (hasRBACPermission(auth, 'reports', 'export')) {
    // Enable export button
  }
}

// ============================================================================
// PATTERN 4: Module Validation in Route Handlers
// ============================================================================

// Example: Create a user
export async function createUserHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Option A: Simple enforcement (throws if denied)
  try {
    enforceRBACPermission(auth, 'users', 'create');
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
      status: 403,
    });
  }
  
  // Process user creation...
}

// Example: Update a project
export async function updateProjectHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Option B: Check and conditional response
  if (!hasRBACPermission(auth, 'projects', 'update')) {
    return new Response(JSON.stringify({ 
      error: 'You do not have permission to update projects' 
    }), {
      status: 403,
    });
  }
  
  // Process project update...
}

// ============================================================================
// PATTERN 5: Client Module Permission Handling
// ============================================================================

import { enforceRBACPermission } from '@/server/rbac/auth-integration';

// In a resource handler that manages clients
export async function getClientsHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Enforce read permission for clients module
  // (This is usually allowed for most roles, but can be restricted)
  enforceRBACPermission(auth, 'clients', 'read');
  
  // Return filtered client list...
}

export async function createClientHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Only managers and admins can create clients
  enforceRBACPermission(auth, 'clients', 'create');
  
  // Process client creation...
}

// ============================================================================
// PATTERN 6: Attendance & Leave Modules
// ============================================================================

import { enforceRBACPermission } from '@/server/rbac/auth-integration';

// Attendance management
export async function attendanceHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'POST') {
    // Only create attendance records (employees can mark themselves)
    enforceRBACPermission(auth, 'attendance', 'create');
  } else if (request.method === 'PUT') {
    // Only managers/admins can update
    enforceRBACPermission(auth, 'attendance', 'update');
  }
  
  // Process...
}

// Leave management
export async function leaveRequestsHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'POST') {
    // Employees can request leaves
    enforceRBACPermission(auth, 'leaves', 'create');
  } else if (request.method === 'PATCH') {
    // Only managers can approve
    enforceRBACPermission(auth, 'leaves', 'approve');
  }
  
  // Process...
}

// ============================================================================
// PATTERN 7: Finance & Reimbursement Modules
// ============================================================================

import { enforceRBACPermission } from '@/server/rbac/auth-integration';

// Invoice management
export async function invoiceHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'DELETE') {
    // Only admins/finance can delete invoices
    enforceRBACPermission(auth, 'finance', 'delete');
  } else if (request.method === 'POST') {
    // Create new invoice
    enforceRBACPermission(auth, 'finance', 'create');
  }
  
  // Process...
}

// Reimbursement handling
export async function reimbursementHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'POST') {
    // Employees can request reimbursements
    enforceRBACPermission(auth, 'reimbursements', 'create');
  }
  
  if (request.method === 'PATCH') {
    // Finance/admin can approve
    enforceRBACPermission(auth, 'reimbursements', 'approve');
  }
  
  // Process...
}

// ============================================================================
// PATTERN 8: Settings & System Management
// ============================================================================

import { enforceRBACPermission } from '@/server/rbac/auth-integration';

export async function settingsHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Only admins can modify settings
  enforceRBACPermission(auth, 'settings', 'update');
  
  // Process...
}

export async function systemUsersHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'POST') {
    // Only admins can create new users
    enforceRBACPermission(auth, 'users', 'create');
  } else if (request.method === 'DELETE') {
    // Only admins can delete users
    enforceRBACPermission(auth, 'users', 'delete');
  }
  
  // Process...
}

// ============================================================================
// PATTERN 9: Tickets & Support Module
// ============================================================================

import { enforceRBACPermission } from '@/server/rbac/auth-integration';

export async function ticketHandler(request: Request, context: any) {
  const auth = context.auth;
  
  if (request.method === 'POST') {
    // Anyone can create tickets
    enforceRBACPermission(auth, 'tickets', 'create');
  }
  
  if (request.method === 'PATCH') {
    // Only support team can update/respond
    enforceRBACPermission(auth, 'tickets', 'update');
  }
  
  // Process...
}

// ============================================================================
// PATTERN 10: Export/Reporting Features
// ============================================================================

import { hasRBACPermission } from '@/server/rbac/auth-integration';

export async function reportExportHandler(request: Request, context: any) {
  const auth = context.auth;
  
  // Check if user has export permission for reports
  if (!hasRBACPermission(auth, 'reports', 'export')) {
    return new Response(JSON.stringify({ 
      error: 'Export functionality not available for your role' 
    }), {
      status: 403,
    });
  }
  
  // Generate and return exported report...
}

// ============================================================================
// EXISTING ROUTE EXAMPLES - Already Working!
// ============================================================================

// These routes ALREADY have role protection via withApiHandler:
//
// src/app/api/users/route.ts -> { requireAuth: true, roles: ['Admin'] }
// src/app/api/employees/route.ts -> { requireAuth: true, roles: ['Employee'] }
// src/app/api/clients/route.ts -> { requireAuth: true, roles: ['Employee'] }
// src/app/api/projects/route.ts -> { requireAuth: true, roles: ['Employee'] }
// src/app/api/tasks/route.ts -> { requireAuth: true, roles: ['Employee'] }
//
// These continue to work with the existing AppRole validation.
// The new RBAC system provides ADDITIONAL granular control when needed.

// ============================================================================
// MIGRATION TIMELINE
// ============================================================================

// Phase 1 (Now): New RBAC system is available for use
// - Use new functions in NEW route handlers
// - Existing routes continue to work unchanged
//
// Phase 2 (After Database Migration): 
// - Update authenticateRequest() to check database
// - Gradually migrate routes to module/action format
//
// Phase 3 (Future):
// - Complete migration of all routes
// - Deprecate old AppRole-only validation
// - Full module/action-based access control

// ============================================================================
// FILES TO CHECK FOR INTEGRATION
// ============================================================================

// High Priority - Core Resource Management:
// - src/app/api/users/route.ts
// - src/app/api/employees/route.ts
// - src/app/api/clients/route.ts
// - src/app/api/projects/route.ts
// - src/app/api/tasks/route.ts
//
// Medium Priority - Business Logic:
// - src/app/api/invoices/route.ts
// - src/app/api/expenses/route.ts
// - src/app/api/attendance/route.ts
// - src/app/api/leave-requests/route.ts
// - src/app/api/tickets/route.ts
//
// Lower Priority - Ancillary:
// - src/app/api/uploads/route.ts
// - src/app/api/chat-messages/route.ts
// - src/app/api/notifications/route.ts
// - src/app/api/activity-logs/route.ts

// ============================================================================
// IMPLEMENTATION CHECKLIST
// ============================================================================

// □ Identify routes needing enhanced permission checking
// □ Import { enforceRBACPermission, hasRBACPermission } from '@/server/rbac/auth-integration'
// □ Add permission checks in route handlers
// □ Test with different roles to verify behavior
// □ Update error responses to include permission details
// □ Document new permission requirements
// □ Update API documentation/swagger.yaml
// □ Train team on new RBAC system
// □ Monitor logs for permission violations
// □ Plan database migration for full RBAC
