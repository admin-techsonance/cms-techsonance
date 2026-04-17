/**
 * RBAC Utility Functions
 * Provides functions for role checking, permission validation, and access control
 */

import type {
  UserRole,
  ModulePermissions,
  PermissionContext,
  PermissionCheckResult,
} from './types';
import { ROLE_DEFINITIONS, ROLE_HIERARCHY } from './roles';

/**
 * Check if a user has a specific permission for a module
 *
 * @param role - User's role
 * @param module - Module name
 * @param action - Action to check (create, read, update, delete, approve, export)
 * @returns Boolean indicating if permission is granted
 *
 * @example
 * if (hasPermission('developer', 'tasks', 'update')) {
 *   // Allow task update
 * }
 */
export function hasPermission(
  role: UserRole,
  module: keyof ModulePermissions,
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export'
): boolean {
  const roleDefinition = ROLE_DEFINITIONS[role];
  if (!roleDefinition) return false;

  const modulePermission = roleDefinition.permissions[module];
  if (!modulePermission) return false;

  if (action === 'approve' || action === 'export') {
    return modulePermission[action] === true;
  }

  return (modulePermission[action as keyof typeof modulePermission] as boolean) === true;
}

/**
 * Check if a user can perform a specific action on a module
 * This is a wrapper around hasPermission with better context
 *
 * @param context - Permission context
 * @returns PermissionCheckResult with detailed information
 */
export function checkPermission(context: PermissionContext): PermissionCheckResult {
  const roleDefinition = ROLE_DEFINITIONS[context.userRole];

  if (!roleDefinition) {
    return {
      allowed: false,
      denialReason: 'Invalid role',
    };
  }

  const hasAccess = hasPermission(context.userRole, context.module, context.action);

  if (!hasAccess) {
    return {
      allowed: false,
      denialReason: `Role '${roleDefinition.name}' does not have ${context.action} permission for ${context.module}`,
    };
  }

  return {
    allowed: true,
    reason: `Access granted for ${context.action} on ${context.module}`,
  };
}

/**
 * Get all permissions for a specific role
 *
 * @param role - User role
 * @returns ModulePermissions object
 */
export function getRolePermissions(role: UserRole): ModulePermissions | null {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.permissions || null;
}

/**
 * Check if role has admin-level access
 *
 * @param role - User role
 * @returns Boolean
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Check if role is a technical role
 *
 * @param role - User role
 * @returns Boolean
 */
export function isTechnicalRole(role: UserRole): boolean {
  const technicalRoles: UserRole[] = ['developer', 'devops_engineer', 'designer'];
  return technicalRoles.includes(role);
}

/**
 * Check if role is a management role
 *
 * @param role - User role
 * @returns Boolean
 */
export function isManagementRole(role: UserRole): boolean {
  const managementRoles: UserRole[] = ['admin', 'project_manager', 'business_analyst'];
  return managementRoles.includes(role);
}

/**
 * Check if role is a client role
 *
 * @param role - User role
 * @returns Boolean
 */
export function isClientRole(role: UserRole): boolean {
  return role === 'client';
}

/**
 * Check if role has full CRUD access to a module
 *
 * @param role - User role
 * @param module - Module name
 * @returns Boolean
 */
export function hasFullCRUDAccess(role: UserRole, module: keyof ModulePermissions): boolean {
  const hasAll = (
    hasPermission(role, module, 'create') &&
    hasPermission(role, module, 'read') &&
    hasPermission(role, module, 'update') &&
    hasPermission(role, module, 'delete')
  );

  return hasAll;
}

/**
 * Check if role has read access to a module
 *
 * @param role - User role
 * @param module - Module name
 * @returns Boolean
 */
export function hasReadAccess(role: UserRole, module: keyof ModulePermissions): boolean {
  return hasPermission(role, module, 'read');
}

/**
 * Check if role has write access (create or update) to a module
 *
 * @param role - User role
 * @param module - Module name
 * @returns Boolean
 */
export function hasWriteAccess(role: UserRole, module: keyof ModulePermissions): boolean {
  return hasPermission(role, module, 'create') || hasPermission(role, module, 'update');
}

/**
 * Check if one role can manage another role
 *
 * @param managerRole - Role that might have management authority
 * @param targetRole - Role being managed
 * @returns Boolean
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  const hierarchy = ROLE_HIERARCHY[managerRole];
  if (!hierarchy || !hierarchy.canManage) return false;

  return hierarchy.canManage.includes(targetRole);
}

/**
 * Get role level/hierarchy
 *
 * @param role - User role
 * @returns Numeric level (higher = more access)
 */
export function getRoleLevel(role: UserRole): number {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.level || 0;
}

/**
 * Check if one role has higher level than another
 *
 * @param role1 - First role
 * @param role2 - Second role to compare
 * @returns Boolean - true if role1 has higher level
 */
export function hasHigherLevel(role1: UserRole, role2: UserRole): boolean {
  return getRoleLevel(role1) > getRoleLevel(role2);
}

/**
 * Get role name for display
 *
 * @param role - User role
 * @returns Display name
 */
export function getRoleName(role: UserRole): string {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.name || role;
}

/**
 * Get role description
 *
 * @param role - User role
 * @returns Role description
 */
export function getRoleDescription(role: UserRole): string {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.description || '';
}

/**
 * Get role category
 *
 * @param role - User role
 * @returns Role category
 */
export function getRoleCategory(role: UserRole) {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.category || 'other';
}

/**
 * Check if role has specific feature enabled
 *
 * @param role - User role
 * @param feature - Feature name
 * @returns Boolean
 */
export function hasFeature(role: UserRole, feature: string): boolean {
  const roleDefinition = ROLE_DEFINITIONS[role];
  if (!roleDefinition || !roleDefinition.features) return false;

  return roleDefinition.features.includes(feature);
}

/**
 * Get all features available for a role
 *
 * @param role - User role
 * @returns Array of feature names
 */
export function getFeatures(role: UserRole): string[] {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.features || [];
}

/**
 * Check if role is active
 *
 * @param role - User role
 * @returns Boolean
 */
export function isRoleActive(role: UserRole): boolean {
  const roleDefinition = ROLE_DEFINITIONS[role];
  return roleDefinition?.isActive === true;
}

/**
 * Get all modules with at least read access for a role
 *
 * @param role - User role
 * @returns Array of module names
 */
export function getAccessibleModules(role: UserRole): (keyof ModulePermissions)[] {
  const rolePermissions = getRolePermissions(role);
  if (!rolePermissions) return [];

  return (Object.entries(rolePermissions) as [keyof ModulePermissions, any][])
    .filter(([, permission]) => permission.read === true)
    .map(([module]) => module);
}

/**
 * Get all modules with full CRUD access for a role
 *
 * @param role - User role
 * @returns Array of module names
 */
export function getFullAccessModules(role: UserRole): (keyof ModulePermissions)[] {
  const modules = getAccessibleModules(role);
  return modules.filter((module) => hasFullCRUDAccess(role, module));
}

/**
 * Filter array of roles based on a role hierarchy
 * E.g., get all roles that a manager can manage
 *
 * @param managerRole - Manager role
 * @param roles - Roles to filter
 * @returns Filtered roles
 */
export function filterManageableRoles(managerRole: UserRole, roles: UserRole[]): UserRole[] {
  return roles.filter((role) => canManageRole(managerRole, role));
}

/**
 * Validate if a role can perform an action on a resource
 * This includes checking role level, ownership, and permissions
 *
 * @param userRole - User's role
 * @param module - Module/resource type
 * @param action - Action to perform
 * @param resourceOwnerRole - Role of resource owner (if applicable)
 * @returns PermissionCheckResult
 */
export function validateResourceAccess(
  userRole: UserRole,
  module: keyof ModulePermissions,
  action: 'create' | 'read' | 'update' | 'delete',
  resourceOwnerRole?: UserRole
): PermissionCheckResult {
  // Check basic permission
  const basicCheck = checkPermission({
    userRole,
    module,
    action,
    userId: '',
  });

  if (!basicCheck.allowed) {
    return basicCheck;
  }

  // If resource has an owner, check if user can manage it
  if (resourceOwnerRole && action !== 'create') {
    // Admins can manage any resource
    if (!isAdmin(userRole)) {
      // Non-admins can only modify resources owned by lower-level roles
      if (!hasHigherLevel(userRole, resourceOwnerRole)) {
        return {
          allowed: false,
          denialReason: `Cannot ${action} resource owned by ${getRoleName(resourceOwnerRole)}`,
        };
      }
    }
  }

  return basicCheck;
}

/**
 * Get summary of role permissions (for display/debugging)
 *
 * @param role - User role
 * @returns Object with permission summary
 */
export function getPermissionSummary(role: UserRole) {
  const roleDefinition = ROLE_DEFINITIONS[role];
  if (!roleDefinition) return null;

  const permissions = roleDefinition.permissions;
  const summary = {
    role: role,
    name: roleDefinition.name,
    category: roleDefinition.category,
    level: roleDefinition.level,
    features: roleDefinition.features || [],
    modules: {} as Record<string, Record<string, boolean>>,
  };

  for (const [module, perms] of Object.entries(permissions)) {
    summary.modules[module] = {
      read: perms.read,
      create: perms.create,
      update: perms.update,
      delete: perms.delete,
      approve: perms.approve || false,
      export: perms.export || false,
    };
  }

  return summary;
}

/**
 * Compare permissions between two roles
 * Useful for understanding role differences
 *
 * @param role1 - First role
 * @param role2 - Second role
 * @returns Object showing differences
 */
export function compareRoles(role1: UserRole, role2: UserRole) {
  const summary1 = getPermissionSummary(role1);
  const summary2 = getPermissionSummary(role2);

  if (!summary1 || !summary2) return null;

  return {
    role1: {
      name: summary1.name,
      level: summary1.level,
      features: summary1.features,
    },
    role2: {
      name: summary2.name,
      level: summary2.level,
      features: summary2.features,
    },
    levelDifference: summary1.level - summary2.level,
  };
}
