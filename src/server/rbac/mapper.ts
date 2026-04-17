/**
 * RBAC Mapper - Maps between old AppRole system and new RBAC system
 * Provides backward compatibility while using the centralized RBAC
 */

import type { AppRole } from '@/server/auth/constants';
import type { UserRole } from '@/lib/rbac/types';

/**
 * Map old AppRole to new UserRole
 * @param appRole - Old AppRole (SuperAdmin, Admin, Manager, Employee, Viewer)
 * @returns New UserRole key
 */
export function mapAppRoleToUserRole(appRole: AppRole | string): UserRole {
  const roleMap: Record<string, UserRole> = {
    // Old roles to new roles mapping
    'SuperAdmin': 'admin',
    'Admin': 'admin',
    'Manager': 'project_manager',
    'Employee': 'developer', // Default for employees
    'Viewer': 'client',

    // Direct new role mappings (for future use)
    'admin': 'admin',
    'project_manager': 'project_manager',
    'developer': 'developer',
    'designer': 'designer',
    'content_editor': 'content_editor',
    'qa_tester': 'qa_tester',
    'client': 'client',
    'support_team': 'support_team',
    'devops_engineer': 'devops_engineer',
    'business_analyst': 'business_analyst',
    'finance_admin': 'finance_admin',
  };

  return roleMap[appRole as string] || 'client';
}

/**
 * Map new UserRole to old AppRole for backward compatibility
 * @param userRole - New UserRole
 * @returns Old AppRole
 */
export function mapUserRoleToAppRole(userRole: UserRole | string): AppRole {
  const roleMap: Record<string, AppRole> = {
    'admin': 'SuperAdmin',
    'project_manager': 'Manager',
    'developer': 'Employee',
    'designer': 'Employee',
    'content_editor': 'Employee',
    'qa_tester': 'Employee',
    'client': 'Viewer',
    'support_team': 'Employee',
    'devops_engineer': 'Employee',
    'business_analyst': 'Manager',
    'finance_admin': 'Manager',
  };

  return roleMap[userRole as string] || 'Employee';
}

/**
 * Get equivalent AppRoles for an old AppRole
 * Used when checking if a role has access to an action
 *
 * @param appRole - Old AppRole
 * @returns Array of AppRoles that have same or higher level
 */
export function getEquivalentAppRoles(appRole: AppRole): AppRole[] {
  const roleHierarchy: Record<AppRole, AppRole[]> = {
    'SuperAdmin': ['SuperAdmin'],
    'Admin': ['SuperAdmin', 'Admin'],
    'Manager': ['SuperAdmin', 'Admin', 'Manager'],
    'Employee': ['SuperAdmin', 'Admin', 'Manager', 'Employee'],
    'Viewer': ['SuperAdmin', 'Admin', 'Manager', 'Employee', 'Viewer'],
  };

  return roleHierarchy[appRole] || ['Viewer'];
}

/**
 * Check if role has at least the required level
 * @param currentRole - User's current role
 * @param requiredRoles - Required roles
 * @returns Boolean indicating if user has sufficient access
 */
export function hasRequiredRole(currentRole: AppRole | string, requiredRoles: AppRole[]): boolean {
  const normalized = currentRole as AppRole;
  return getEquivalentAppRoles(normalized).some(role => requiredRoles.includes(role));
}
