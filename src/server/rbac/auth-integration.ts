/**
 * RBAC-Enhanced Authentication
 * Extends the standard authentication with RBAC module/action permission checking
 * Uses backward compatibility layer to map old AppRole to new RBAC system
 */

import type { AuthContext } from '@/server/auth/session';
import type { UserRole, ModulePermissions } from '@/lib/rbac/types';
import { mapAppRoleToUserRole } from '@/server/rbac/mapper';
import { UnauthorizedError } from '@/server/http/errors';

export interface RBACAuthContext extends AuthContext {
  userRole?: UserRole;
  permissions?: ModulePermissions;
}

type ModuleKey = keyof ModulePermissions;
type ActionKey = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export';

/**
 * Check if authenticated user has permission for a specific module action
 * Uses existing AppRole hierarchy until database migration
 * @param authContext - Authentication context
 * @param module - Module name (e.g., 'users', 'projects')
 * @param action - Action type (e.g., 'create', 'update')
 * @returns Boolean indicating if user has permission
 */
export function hasRBACPermission(
  authContext: AuthContext | null,
  module: ModuleKey,
  action: ActionKey
): boolean {
  if (!authContext) return false;

  try {
    // For now, use AppRole hierarchy - this can be migrated to database after deployment
    const appRole = authContext.user.role;
    
    // SuperAdmin has access to everything
    if (appRole === 'SuperAdmin') return true;
    
    // Map role to capabilities based on module and action
    const getRoleCapabilities = (role: string, module: ModuleKey, action: ActionKey) => {
      // Basic read access for most modules
      if (action === 'read') {
        return ['SuperAdmin', 'Admin', 'Manager', 'Employee'].includes(role);
      }
      
      // Create access for reports and basic operations
      if (action === 'create' && ['reports', 'users', 'projects', 'tasks'].includes(module)) {
        return ['SuperAdmin', 'Admin', 'Manager', 'Employee'].includes(role);
      }
      
      // Update access for own data
      if (action === 'update' && ['reports', 'users', 'projects', 'tasks'].includes(module)) {
        return ['SuperAdmin', 'Admin', 'Manager', 'Employee'].includes(role);
      }
      
      // Default role capabilities
      const roleCapabilities: Record<string, { canCreate: boolean; canUpdate: boolean; canDelete: boolean; canExport: boolean; canApprove: boolean }> = {
        'SuperAdmin': { canCreate: true, canUpdate: true, canDelete: true, canExport: true, canApprove: true },
        'Admin': { canCreate: true, canUpdate: true, canDelete: true, canExport: true, canApprove: true },
        'Manager': { canCreate: true, canUpdate: true, canDelete: false, canExport: true, canApprove: true },
        'Employee': { canCreate: true, canUpdate: true, canDelete: false, canExport: false, canApprove: false },
        'Viewer': { canCreate: false, canUpdate: false, canDelete: false, canExport: false, canApprove: false },
      };
      
      const capabilities = roleCapabilities[role] || roleCapabilities['Viewer'];
      
      switch (action) {
        case 'create':
          return capabilities.canCreate;
        case 'update':
          return capabilities.canUpdate;
        case 'delete':
          return capabilities.canDelete;
        case 'approve':
          return capabilities.canApprove;
        case 'export':
          return capabilities.canExport;
        default:
          return false;
      }
    };

    return getRoleCapabilities(appRole, module, action);
  } catch (error) {
    console.error('Error checking RBAC permission:', error);
    return false;
  }
}

/**
 * Check multiple permissions (any must be true)
 */
export function hasAnyRBACPermission(
  authContext: AuthContext | null,
  checks: Array<{ module: ModuleKey; action: ActionKey }>
): boolean {
  return checks.some(({ module, action }) => hasRBACPermission(authContext, module, action));
}

/**
 * Check multiple permissions (all must be true)
 */
export function hasAllRBACPermissions(
  authContext: AuthContext | null,
  checks: Array<{ module: ModuleKey; action: ActionKey }>
): boolean {
  return checks.every(({ module, action }) => hasRBACPermission(authContext, module, action));
}

/**
 * Enforce RBAC permission - throws error if not permitted
 */
export function enforceRBACPermission(
  authContext: AuthContext | null,
  module: ModuleKey,
  action: ActionKey
): void {
  const hasPermission = hasRBACPermission(authContext, module, action);
  
  if (!hasPermission) {
    throw new UnauthorizedError(`Insufficient permissions for ${module}.${action}`);
  }
}
