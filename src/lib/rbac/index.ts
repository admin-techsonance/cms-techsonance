/**
 * RBAC Index - Centralized export of all RBAC utilities
 * This makes it easy to import all RBAC functionality
 */

// Type exports
export type {
  CoreRole,
  AdvancedRole,
  UserRole,
  RoleCategory,
  CRUDPermission,
  ModulePermissions,
  RoleMetadata,
  RoleDefinition,
  RoleHierarchy,
  PermissionContext,
  PermissionCheckResult,
} from './types';

// Role definitions and constants
export {
  ROLE_DEFINITIONS,
  ROLE_HIERARCHY,
  ROLE_CATEGORIES,
  getAllRoles,
  getCoreRoles,
  getAdvancedRoles,
} from './roles';

// Utility functions
export {
  hasPermission,
  checkPermission,
  getRolePermissions,
  isAdmin,
  isTechnicalRole,
  isManagementRole,
  isClientRole,
  hasFullCRUDAccess,
  hasReadAccess,
  hasWriteAccess,
  canManageRole,
  getRoleLevel,
  hasHigherLevel,
  getRoleName,
  getRoleDescription,
  getRoleCategory,
  hasFeature,
  getFeatures,
  isRoleActive,
  getAccessibleModules,
  getFullAccessModules,
  filterManageableRoles,
  validateResourceAccess,
  getPermissionSummary,
  compareRoles,
} from './utils';
